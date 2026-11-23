import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, gte, isNull } from "drizzle-orm";
import { createHash, randomUUID } from "crypto";
import {
  db,
  lookbooksTable,
  lookbookDressesTable,
  dressesTable,
  dressMediaTable,
  coupleSessionsTable,
  coupleMediaTable,
  uploadIntentsTable,
  generatedAssetsTable,
  creditTransactionsTable,
  organizationsTable,
} from "@workspace/db";
import { consentRecordsTable } from "@workspace/db/schema";
import { GenerateTryonLookBody } from "@workspace/api-zod";
import { rateLimit, clientKey, releaseSubmittedPhoto } from "../lib/rateLimit.js";
import { logger } from "../lib/logger.js";
import { isWellFormedLookbookToken } from "../lib/lookbookToken.js";
import { lookbookUsability, retentionExpiryFor } from "../lib/lookbookPolicy.js";
import { decideLookDebit } from "../lib/lookDebit.js";
import { orderDressMediaForGeneration, type DressMediaCoverage } from "../lib/dressCoverage.js";
import { runTryonLook, type DressReference } from "../lib/runTryonLook.js";
import { VISUALIZATION_DISCLAIMER } from "../lib/tryonQuality.js";
import { ObjectStorageService, mimeTypeFromObjectPath } from "../lib/objectStorage.js";
import { refundCreditsForSession } from "../lib/credits.js";
import { reviewBridePhoto } from "../lib/bridePhotoReview.js";
import { assertReferenceImageQuality } from "../lib/referenceImageQuality.js";
import { runRetentionPurge } from "../lib/retentionPurgeExecutor.js";
import {
  gatherSessionObjectKeys,
  deleteObject,
  finalizeSessionsPurge,
} from "../lib/retentionPurgeSweeper.js";
import type { SessionRetentionRecord } from "../lib/retentionPurge.js";

const router: IRouter = Router();
const storage = new ObjectStorageService();

function extensionForMime(contentType: string): string {
  if (contentType.includes("png")) return ".png";
  if (contentType.includes("webp")) return ".webp";
  return ".jpg";
}

async function fetchBuffer(objectKey: string): Promise<Buffer | null> {
  try {
    const file = await storage.getObjectEntityFile(objectKey);
    const [content] = await file.download();
    return content as Buffer;
  } catch (err) {
    logger.warn({ err, objectKey }, "try-on: failed to fetch object");
    return null;
  }
}

async function uploadBuffer(buffer: Buffer, contentType: string): Promise<string> {
  const uploadURL = await storage.getObjectEntityUploadURL(extensionForMime(contentType));
  const objectKey = storage.normalizeObjectEntityPath(uploadURL);
  const res = await fetch(uploadURL, {
    method: "PUT",
    headers: { "Content-Type": contentType, "Content-Length": String(buffer.length) },
    body: buffer,
  });
  if (!res.ok) throw new Error(`Storage upload failed (${res.status})`);
  return objectKey;
}

class LookConflict extends Error {}

// Bound concurrent image buffers and provider spend on this single-replica service.
let activeLooks = 0;
const MAX_CONCURRENT_LOOKS = 2;

// Both entry points share validation, debit, render and settlement.
router.post(["/try/:lookbookToken/looks", "/try/:lookbookToken/jobs"], async (req, res): Promise<void> => {
  if (activeLooks >= MAX_CONCURRENT_LOOKS) {
    res.set("Retry-After", "15").status(429).json({ error: "The fitting studio is busy. Please try again in a moment." });
    return;
  }
  activeLooks++;
  try {
    await createLook(req, res);
  } finally {
    activeLooks--;
  }
});

async function createLook(req: Request, res: Response): Promise<void> {
  const token = req.params.lookbookToken;
  if (typeof token !== "string" || !isWellFormedLookbookToken(token)) {
    res.status(404).json({ error: "This link isn't valid." });
    return;
  }
  const parsed = GenerateTryonLookBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const body = parsed.data;
  if (body.consent !== true) {
    res.status(400).json({ error: "Please confirm consent to create your try-on." });
    return;
  }

  const [lookbook] = await db.select().from(lookbooksTable).where(eq(lookbooksTable.token, token)).limit(1);
  if (!lookbook) {
    res.status(404).json({ error: "This link isn't valid." });
    return;
  }
  const usability = lookbookUsability(lookbook, new Date());
  if (!usability.usable) {
    res.status(409).json({ error: `This lookbook is ${usability.reason}.` });
    return;
  }

  // The dress must belong to this lookbook.
  const [link] = await db
    .select({ dressId: lookbookDressesTable.dressId })
    .from(lookbookDressesTable)
    .where(and(eq(lookbookDressesTable.lookbookId, lookbook.id), eq(lookbookDressesTable.dressId, body.dressId)))
    .limit(1);
  if (!link) {
    res.status(404).json({ error: "That dress isn't in this lookbook." });
    return;
  }

  const [dress] = await db.select().from(dressesTable).where(eq(dressesTable.id, body.dressId)).limit(1);
  if (!dress) {
    res.status(404).json({ error: "That dress isn't available." });
    return;
  }

  // Bride photo: download, validate quality, fingerprint for the consent record.
  if (!body.bridePhotoObjectKey.startsWith("/objects/uploads/")) {
    res.status(400).json({ error: "Your photo upload is not valid. Please upload it again." });
    return;
  }
  const availableUpload = () => and(
    eq(uploadIntentsTable.objectKey, body.bridePhotoObjectKey),
    eq(uploadIntentsTable.venueId, lookbook.shopId),
    eq(uploadIntentsTable.purpose, "couple"),
    isNull(uploadIntentsTable.consumedAt),
    gte(uploadIntentsTable.expiresAt, new Date()),
  );
  const [intent] = await db.select({ id: uploadIntentsTable.id }).from(uploadIntentsTable).where(availableUpload()).limit(1);
  if (!intent) {
    res.status(409).json({ error: "Please upload a fresh photo for this lookbook." });
    return;
  }
  const brideBuffer = await fetchBuffer(body.bridePhotoObjectKey);
  if (!brideBuffer) {
    res.status(400).json({ error: "We couldn't find your photo. Please upload it again." });
    return;
  }
  let photoQuality;
  try {
    photoQuality = await assertReferenceImageQuality({ buffer: brideBuffer, label: "Your photo", minEdgePx: 256, profile: "couple" });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Please upload a clearer, full-length photo." });
    return;
  }
  try {
    const review = await reviewBridePhoto(brideBuffer, photoQuality);
    if (!review.ok) {
      res.status(422).json({ error: review.reason });
      return;
    }
  } catch {
    res.status(503).json({ error: "Photo review is temporarily unavailable. Please try again later." });
    return;
  }
  const brideMime = mimeTypeFromObjectPath(body.bridePhotoObjectKey);
  const fingerprint = createHash("sha256").update(brideBuffer).digest("hex");

  // Dress references: front required, then detail/fabric/back for garment fidelity.
  const media = await db
    .select({ objectKey: dressMediaTable.objectKey, coverage: dressMediaTable.coverage })
    .from(dressMediaTable)
    .where(eq(dressMediaTable.dressId, dress.id))
    .orderBy(dressMediaTable.displayOrder, dressMediaTable.id);
  const ordered = orderDressMediaForGeneration(media);
  if (!ordered.some((m) => m.coverage === "front")) {
    res.status(400).json({ error: "This dress isn't ready to try on yet." });
    return;
  }
  const dressReferences: DressReference[] = [];
  for (const m of ordered.slice(0, 6)) {
    const buf = await fetchBuffer(m.objectKey);
    if (buf) {
      dressReferences.push({ buffer: buf, mimeType: mimeTypeFromObjectPath(m.objectKey), coverage: m.coverage as DressMediaCoverage });
    }
  }
  if (!dressReferences.some(ref => ref.coverage === "front")) {
    res.status(400).json({ error: "This dress isn't ready to try on yet." });
    return;
  }

  // Reserve a shop credit, record usage, and consume this upload in one transaction.
  const shareToken = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "").slice(0, 8);
  const charge = await db.transaction(async (tx) => {
    const [lb] = await tx
      .select()
      .from(lookbooksTable)
      .where(eq(lookbooksTable.id, lookbook.id))
      .limit(1).for("update");
    if (!lb) return null;
    if (!lookbookUsability(lb, new Date()).usable) throw new LookConflict("This lookbook is no longer available.");
    const [org] = await tx
      .select({ id: organizationsTable.id, creditsBalance: organizationsTable.creditsBalance })
      .from(organizationsTable)
      .where(eq(organizationsTable.id, lb.organizationId))
      .limit(1).for("update");
    if (!org) return { failed: "insufficient_org_credits" as const };

    const decision = decideLookDebit({ creditsUsed: lb.creditsUsed, orgCreditsBalance: org.creditsBalance });
    if (!decision.ok) return { failed: decision.reason };

    await tx.update(lookbooksTable)
      .set({ creditsUsed: decision.nextCreditsUsed })
      .where(eq(lookbooksTable.id, lb.id));
    await tx.update(organizationsTable)
      .set({ creditsBalance: decision.nextOrgBalance })
      .where(eq(organizationsTable.id, org.id));
    const consumed = await tx.update(uploadIntentsTable).set({ consumedAt: new Date() })
      .where(availableUpload()).returning({ id: uploadIntentsTable.id });
    if (!consumed.length) throw new LookConflict("Please upload a fresh photo for this lookbook.");

    const [session] = await tx
      .insert(coupleSessionsTable)
      .values({ venueId: lb.shopId, status: "processing", coupleEmail: body.brideEmail.trim().toLowerCase(), shareToken, creditsCharged: decision.cost })
      .returning({ id: coupleSessionsTable.id });

    await tx.insert(coupleMediaTable).values({ sessionId: session!.id, objectKey: body.bridePhotoObjectKey });
    await tx.insert(consentRecordsTable).values({
      sessionId: session!.id,
      lookbookId: lookbook.id,
      subjectEmail: body.brideEmail.trim().toLowerCase(),
      consentType: "image_use",
      fingerprint,
      affirmative: true,
      retentionExpiresAt: retentionExpiryFor(new Date()),
    });

    await tx.insert(creditTransactionsTable).values({
      organizationId: org.id,
      venueId: lb.shopId,
      delta: -decision.cost,
      reason: "session_debit",
      sessionId: session!.id,
    });

    return { session: session!, organizationId: org.id };
  }).catch((err: unknown) => {
    if (!(err instanceof LookConflict)) throw err;
    return { conflict: err.message };
  });
  if (charge && "conflict" in charge) {
    res.status(409).json({ error: charge.conflict });
    return;
  }

  if (!charge) {
    res.status(404).json({ error: "This link isn't valid." });
    return;
  }
  if ("failed" in charge) {
    res.status(402).json({ error: "Your boutique needs to add credits before it can create another preview. Please contact your stylist." });
    return;
  }

  releaseSubmittedPhoto(clientKey(req), body.bridePhotoObjectKey);

  // Generate the look (garment-fidelity gate + adaptive retry). On any failure,
  // refund the credit so a failed look never costs the shop.
  const asynchronous = req.path.endsWith("/jobs");
  if (asynchronous) res.status(202).json({ shareToken });
  let storedKey: string | undefined;
  try {
    const look = await runTryonLook({
      sessionId: charge.session.id,
      dress: {
        styleName: dress.styleName,
        designer: dress.designer,
        silhouette: dress.silhouette,
        neckline: dress.neckline,
        sleeve: dress.sleeve,
        trainLength: dress.trainLength,
        fabric: dress.fabric,
        color: dress.color,
      },
      brideReferences: [{ buffer: brideBuffer, mimeType: brideMime }],
      dressReferences,
    });

    if (look.consultantReview) throw new Error("Look did not meet the bridal publication thresholds");
    const objectKey = await uploadBuffer(look.polished, look.mimeType);
    storedKey = objectKey;
    await db.transaction(async tx => {
      const [claimed] = await tx.update(coupleSessionsTable)
        .set({ status: "ready", completedAt: new Date() })
        .where(and(eq(coupleSessionsTable.id, charge.session.id), eq(coupleSessionsTable.status, "processing")))
        .returning({ id: coupleSessionsTable.id });
      if (!claimed) throw new Error("Render was already settled");
      await tx.insert(generatedAssetsTable).values({
        sessionId: charge.session.id,
        objectKey,
        assetType: "image",
        displayOrder: 1,
        generationModel: look.model,
        generationAttempts: look.attempts,
        qualityReport: look.report as unknown as Record<string, unknown>,
      });
    });
    storedKey = undefined;
    if (asynchronous) return;
    res.status(201).json({
      objectKey,
      shareToken,
      disclaimer: VISUALIZATION_DISCLAIMER,
      consultantReview: look.consultantReview,
      brideLikenessScore: look.report.brideLikenessScore,
      garmentFidelityScore: look.report.garmentFidelityScore,
      bodyProportionScore: look.report.bodyProportionScore,
    });
  } catch (err) {
    logger.error({ err, sessionId: charge.session.id }, "try-on look generation failed");
    if (storedKey) await storage.deleteObjectEntity(storedKey).catch(err => logger.error({ err }, "Could not remove unpublished image"));
    try {
      await refundCreditsForSession(charge.session.id, "This look did not pass review. Try another reference photo.");
    } catch (refundError) {
      logger.error({ err: refundError, sessionId: charge.session.id }, "Render refund needs recovery");
      if (!asynchronous) res.status(503).json({ error: "The look could not be completed. Its credit is awaiting reconciliation." });
      return;
    }
    if (!asynchronous) res.status(502).json({ error: "This look could not be delivered. Your credit has been returned." });
  }
}

// POST /try/looks/:shareToken/forget — the bride's "delete everything about me"
// (spec §6.3). No account: the share token is the capability. Immediately hard-
// deletes her look imagery and scrubs the consent fingerprint. Reuses the
// retention executor so a session is only marked purged after every one of its
// storage objects is confirmed deleted. Idempotent — safe to call repeatedly.
router.post("/try/looks/:shareToken/forget", async (req, res): Promise<void> => {
  if (!rateLimit(`forget:${clientKey(req)}`, 20, 60 * 60 * 1000)) {
    res.status(429).json({ error: "Too many requests. Please wait a bit." });
    return;
  }

  const shareToken = req.params.shareToken;
  if (!shareToken || shareToken.length < 16) {
    res.status(404).json({ error: "We couldn't find that try-on." });
    return;
  }

  const [session] = await db
    .select({ id: coupleSessionsTable.id })
    .from(coupleSessionsTable)
    .where(eq(coupleSessionsTable.shareToken, shareToken))
    .limit(1);
  if (!session) {
    res.status(404).json({ error: "We couldn't find that try-on." });
    return;
  }

  const { sourceBySession, derivedBySession } = await gatherSessionObjectKeys([session.id]);
  const record: SessionRetentionRecord = {
    sessionId: session.id,
    // revokedAt set → collectPurgeTargets selects it regardless of the horizon.
    consent: { revokedAt: new Date(), retentionExpiresAt: null, purgedAt: null },
    sourceObjectKeys: sourceBySession.get(session.id) ?? [],
    derivedObjectKeys: derivedBySession.get(session.id) ?? [],
  };

  try {
    const result = await runRetentionPurge({
      loadDueRecords: async () => [record],
      deleteObject,
      finalizePurge: (ids, now) => finalizeSessionsPurge(ids, now, { markRevoked: true }),
    });
    const hadImagery = record.sourceObjectKeys.length + record.derivedObjectKeys.length > 0;
    if (result.sessionsPurged === 0 && hadImagery) {
      // A storage delete failed — never claim deletion that did not happen.
      res.status(502).json({ error: "We couldn't fully delete your try-on. Please try again." });
      return;
    }
    res.status(200).json({ deleted: true });
  } catch (err) {
    logger.error({ err, sessionId: session.id }, "subject forget-me purge failed");
    res.status(502).json({ error: "We couldn't delete your try-on right now. Please try again." });
  }
});

export default router;

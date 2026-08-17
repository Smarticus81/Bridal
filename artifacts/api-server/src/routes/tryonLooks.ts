import { Router, type IRouter } from "express";
import { and, eq, gte, sql } from "drizzle-orm";
import { createHash, randomUUID } from "crypto";
import {
  db,
  lookbooksTable,
  lookbookDressesTable,
  dressesTable,
  dressMediaTable,
  coupleSessionsTable,
  generatedAssetsTable,
  creditTransactionsTable,
  organizationsTable,
} from "@workspace/db";
import { consentRecordsTable } from "@workspace/db/schema";
import { GenerateTryonLookBody } from "@workspace/api-zod";
import { rateLimit, clientKey } from "../lib/rateLimit.js";
import { logger } from "../lib/logger.js";
import { isWellFormedLookbookToken } from "../lib/lookbookToken.js";
import { lookbookUsability, retentionExpiryFor } from "../lib/lookbookPolicy.js";
import { decideLookDebit } from "../lib/lookDebit.js";
import { orderDressMediaForGeneration, type DressMediaCoverage } from "../lib/dressCoverage.js";
import { runTryonLook, type DressReference } from "../lib/runTryonLook.js";
import { VISUALIZATION_DISCLAIMER } from "../lib/tryonQuality.js";
import { ObjectStorageService, mimeTypeFromObjectPath } from "../lib/objectStorage.js";
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

/** Reverse a look debit when generation fails, so a failed look never costs a credit. */
async function refundLook(lookbookId: number, organizationId: number, sessionId: number): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(lookbooksTable)
      .set({ creditsUsed: sql`GREATEST(${lookbooksTable.creditsUsed} - 1, 0)` })
      .where(eq(lookbooksTable.id, lookbookId));
    await tx
      .update(organizationsTable)
      .set({ creditsBalance: sql`${organizationsTable.creditsBalance} + 1` })
      .where(eq(organizationsTable.id, organizationId));
    await tx.insert(creditTransactionsTable).values({
      organizationId,
      delta: 1,
      reason: "session_refund",
      sessionId,
    });
    await tx
      .update(coupleSessionsTable)
      .set({ status: "failed", errorMessage: "Look generation failed; credit refunded." })
      .where(eq(coupleSessionsTable.id, sessionId));
  });
}

// POST /try/:lookbookToken/looks — bride generates a look for a chosen dress.
router.post("/try/:lookbookToken/looks", async (req, res): Promise<void> => {
  if (!rateLimit(`tryonlook:${clientKey(req)}`, 30, 60 * 60 * 1000)) {
    res.status(429).json({ error: "Too many tries from this address. Please wait a bit." });
    return;
  }

  const token = req.params.lookbookToken;
  if (!isWellFormedLookbookToken(token)) {
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
  const brideBuffer = await fetchBuffer(body.bridePhotoObjectKey);
  if (!brideBuffer) {
    res.status(400).json({ error: "We couldn't find your photo. Please upload it again." });
    return;
  }
  try {
    await assertReferenceImageQuality({ buffer: brideBuffer, label: "Your photo", minEdgePx: 256, profile: "couple" });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Please upload a clearer, full-length photo." });
    return;
  }
  const brideMime = mimeTypeFromObjectPath(body.bridePhotoObjectKey);
  const fingerprint = createHash("sha256").update(brideBuffer).digest("hex");

  // Dress references: front required, then detail/fabric/back for garment fidelity.
  const media = await db
    .select({ objectKey: dressMediaTable.objectKey, coverage: dressMediaTable.coverage })
    .from(dressMediaTable)
    .where(eq(dressMediaTable.dressId, dress.id));
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
  if (dressReferences.length === 0) {
    res.status(400).json({ error: "This dress isn't ready to try on yet." });
    return;
  }

  // Debit one credit atomically (lookbook cap + org balance), create the session,
  // record consent. Guarded compare-and-set keeps the debit safe under contention.
  const shareToken = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "").slice(0, 8);
  const charge = await db.transaction(async (tx) => {
    const [lb] = await tx
      .select({ creditCap: lookbooksTable.creditCap, creditsUsed: lookbooksTable.creditsUsed, organizationId: lookbooksTable.organizationId, shopId: lookbooksTable.shopId })
      .from(lookbooksTable)
      .where(eq(lookbooksTable.id, lookbook.id))
      .limit(1);
    if (!lb) return null;
    const [org] = await tx
      .select({ id: organizationsTable.id, creditsBalance: organizationsTable.creditsBalance })
      .from(organizationsTable)
      .where(eq(organizationsTable.id, lb.organizationId))
      .limit(1);
    if (!org) return { failed: "insufficient_org_credits" as const };

    const decision = decideLookDebit({ creditCap: lb.creditCap, creditsUsed: lb.creditsUsed, orgCreditsBalance: org.creditsBalance });
    if (!decision.ok) return { failed: decision.reason };

    const lbUpdated = await tx
      .update(lookbooksTable)
      .set({ creditsUsed: decision.nextCreditsUsed })
      .where(and(eq(lookbooksTable.id, lookbook.id), eq(lookbooksTable.creditsUsed, lb.creditsUsed)))
      .returning({ id: lookbooksTable.id });
    if (lbUpdated.length === 0) return { failed: "lookbook_exhausted" as const };

    const orgUpdated = await tx
      .update(organizationsTable)
      .set({ creditsBalance: sql`${organizationsTable.creditsBalance} - 1` })
      .where(and(eq(organizationsTable.id, org.id), gte(organizationsTable.creditsBalance, 1)))
      .returning({ id: organizationsTable.id });
    if (orgUpdated.length === 0) return { failed: "insufficient_org_credits" as const };

    const [session] = await tx
      .insert(coupleSessionsTable)
      .values({ venueId: lb.shopId, status: "processing", coupleEmail: body.brideEmail.trim().toLowerCase(), shareToken, creditsCharged: 1 })
      .returning({ id: coupleSessionsTable.id });

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
      delta: -1,
      reason: "session_debit",
      sessionId: session!.id,
    });

    return { session: session!, organizationId: org.id };
  });

  if (!charge) {
    res.status(404).json({ error: "This link isn't valid." });
    return;
  }
  if ("failed" in charge) {
    const message = charge.failed === "lookbook_exhausted" ? "This lookbook has no tries left." : "The shop is temporarily out of credits.";
    res.status(402).json({ error: message });
    return;
  }

  // Generate the look (garment-fidelity gate + adaptive retry). On any failure,
  // refund the credit so a failed look never costs the shop.
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

    const objectKey = await uploadBuffer(look.polished, look.mimeType);
    await db.insert(generatedAssetsTable).values({
      sessionId: charge.session.id,
      objectKey,
      assetType: "image",
      displayOrder: 1,
      generationModel: look.model,
      generationAttempts: look.attempts,
      qualityReport: look.report as unknown as Record<string, unknown>,
    });
    await db
      .update(coupleSessionsTable)
      .set({ status: "ready", completedAt: new Date() })
      .where(eq(coupleSessionsTable.id, charge.session.id));

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
    await refundLook(lookbook.id, charge.organizationId, charge.session.id).catch(() => {});
    res.status(502).json({ error: "We couldn't create this look. Your credit was not used — please try another dress." });
  }
});

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

import { Router, type IRouter } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  dressesTable,
  dressMediaTable,
  lookbooksTable,
  lookbookDressesTable,
  venuesTable,
} from "@workspace/db";
import { CreateLookbookBody } from "@workspace/api-zod";
import { requireOrg, requireOwnerMutationOrigin } from "../lib/orgAuth.js";
import { getAppBaseUrl } from "../lib/appUrl.js";
import { isWellFormedLookbookToken, mintLookbookToken } from "../lib/lookbookToken.js";
import { lookbookRemainingCredits, lookbookUsability } from "../lib/lookbookPolicy.js";
import { VISUALIZATION_DISCLAIMER } from "../lib/tryonQuality.js";

const router: IRouter = Router();

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// GET /lookbooks — the caller's org lookbooks with live usability + burn meter.
router.get("/lookbooks", async (req, res): Promise<void> => {
  const ctx = await requireOrg(req, res);
  if (!ctx) return;

  const now = new Date();
  const rows = await db
    .select()
    .from(lookbooksTable)
    .where(eq(lookbooksTable.organizationId, ctx.org.id))
    .orderBy(desc(lookbooksTable.createdAt));

  const lookbooks = rows.map((row) => ({
    id: row.id,
    token: row.token,
    purpose: row.purpose,
    creditCap: row.creditCap,
    creditsUsed: row.creditsUsed,
    remainingCredits: lookbookRemainingCredits(row),
    expiresAt: row.expiresAt,
    status: row.status,
    usable: lookbookUsability(row, now).usable,
  }));
  res.json({ lookbooks });
});

// POST /lookbooks — create a curated, capped, expiring lookbook link.
router.post("/lookbooks", async (req, res): Promise<void> => {
  if (!requireOwnerMutationOrigin(req, res)) return;
  const ctx = await requireOrg(req, res);
  if (!ctx) return;

  const parsed = CreateLookbookBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const body = parsed.data;

  // The shop must belong to the caller's org.
  const [shop] = await db
    .select({ id: venuesTable.id })
    .from(venuesTable)
    .where(and(eq(venuesTable.id, body.shopId), eq(venuesTable.organizationId, ctx.org.id)))
    .limit(1);
  if (!shop) {
    res.status(400).json({ error: "That shop is not in your organization." });
    return;
  }

  // Every dress must be in the caller's catalog.
  const uniqueDressIds = [...new Set(body.dressIds)];
  const catalogDresses = await db
    .select({ id: dressesTable.id })
    .from(dressesTable)
    .where(and(eq(dressesTable.organizationId, ctx.org.id), inArray(dressesTable.id, uniqueDressIds)));
  if (catalogDresses.length !== uniqueDressIds.length) {
    res.status(400).json({ error: "One or more dresses are not in your catalog." });
    return;
  }

  const token = mintLookbookToken();
  const expiresAt = new Date(Date.now() + body.expiresInDays * MS_PER_DAY);

  const [created] = await db
    .insert(lookbooksTable)
    .values({
      organizationId: ctx.org.id,
      shopId: body.shopId,
      token,
      purpose: body.purpose,
      brideName: body.brideName ?? null,
      brideEmail: body.brideEmail ?? null,
      creditCap: body.creditCap,
      creditsUsed: 0,
      expiresAt,
      status: "active",
    })
    .returning();

  await db.insert(lookbookDressesTable).values(
    uniqueDressIds.map((dressId, index) => ({
      lookbookId: created!.id,
      dressId,
      displayOrder: index,
    })),
  );

  res.status(201).json({
    id: created!.id,
    token: created!.token,
    url: `${getAppBaseUrl()}/try/${created!.token}`,
    purpose: created!.purpose,
    brideName: created!.brideName,
    brideEmail: created!.brideEmail,
    creditCap: created!.creditCap,
    creditsUsed: created!.creditsUsed,
    remainingCredits: lookbookRemainingCredits(created!),
    expiresAt: created!.expiresAt,
    status: created!.status,
    dressCount: uniqueDressIds.length,
  });
});

// GET /try/:lookbookToken — public bride entry. No account. Calm state when unusable.
router.get("/try/:lookbookToken", async (req, res): Promise<void> => {
  const token = req.params.lookbookToken;
  if (!isWellFormedLookbookToken(token)) {
    res.status(404).json({ error: "This link isn't valid." });
    return;
  }

  const [lookbook] = await db
    .select()
    .from(lookbooksTable)
    .where(eq(lookbooksTable.token, token))
    .limit(1);
  if (!lookbook) {
    res.status(404).json({ error: "This link isn't valid." });
    return;
  }

  const usability = lookbookUsability(lookbook, new Date());

  const [shop] = await db
    .select({ name: venuesTable.name })
    .from(venuesTable)
    .where(eq(venuesTable.id, lookbook.shopId))
    .limit(1);

  const dressRows = await db
    .select({
      id: dressesTable.id,
      styleName: dressesTable.styleName,
      designer: dressesTable.designer,
      silhouette: dressesTable.silhouette,
      neckline: dressesTable.neckline,
      displayOrder: lookbookDressesTable.displayOrder,
    })
    .from(lookbookDressesTable)
    .innerJoin(dressesTable, eq(lookbookDressesTable.dressId, dressesTable.id))
    .where(eq(lookbookDressesTable.lookbookId, lookbook.id))
    .orderBy(lookbookDressesTable.displayOrder);

  const dressIds = dressRows.map((row) => row.id);
  const fronts = dressIds.length
    ? await db
        .select({ dressId: dressMediaTable.dressId, objectKey: dressMediaTable.objectKey })
        .from(dressMediaTable)
        .where(and(inArray(dressMediaTable.dressId, dressIds), eq(dressMediaTable.coverage, "front")))
    : [];
  const frontByDress = new Map<number, string>();
  for (const front of fronts) {
    if (!frontByDress.has(front.dressId)) frontByDress.set(front.dressId, front.objectKey);
  }

  res.json({
    usable: usability.usable,
    reason: usability.usable ? null : usability.reason,
    purpose: lookbook.purpose,
    remainingCredits: lookbookRemainingCredits(lookbook),
    shopName: shop?.name ?? "",
    disclaimer: VISUALIZATION_DISCLAIMER,
    dresses: dressRows.map((row) => ({
      id: row.id,
      styleName: row.styleName,
      designer: row.designer,
      silhouette: row.silhouette,
      neckline: row.neckline,
      frontImageObjectKey: frontByDress.get(row.id) ?? null,
    })),
  });
});

export default router;

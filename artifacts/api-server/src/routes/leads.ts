import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, leadsTable, lookbooksTable } from "@workspace/db";
import { CreateLeadBody } from "@workspace/api-zod";
import { requireOrg } from "../lib/orgAuth.js";
import { isWellFormedLookbookToken } from "../lib/lookbookToken.js";
import { rateLimit, clientKey } from "../lib/rateLimit.js";

const router: IRouter = Router();

// GET /leads — the caller's org leads for the console.
router.get("/leads", async (req, res): Promise<void> => {
  const ctx = await requireOrg(req, res);
  if (!ctx) return;

  const rows = await db
    .select()
    .from(leadsTable)
    .where(eq(leadsTable.organizationId, ctx.org.id))
    .orderBy(desc(leadsTable.createdAt));

  res.json({
    leads: rows.map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      phone: row.phone,
      source: row.source,
      shopId: row.shopId,
      lookbookId: row.lookbookId,
      createdAt: row.createdAt,
    })),
  });
});

// POST /leads — public capture from the remote flow (fires after her first look).
// Org + shop are derived from the lookbook token, so a caller cannot attribute a
// lead to an org they don't belong to.
router.post("/leads", async (req, res): Promise<void> => {
  if (!rateLimit(`lead:${clientKey(req)}`, 20, 60 * 60 * 1000)) {
    res.status(429).json({ error: "Too many submissions from this address. Try again later." });
    return;
  }

  const parsed = CreateLeadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { lookbookToken, email, name, phone } = parsed.data;

  if (!isWellFormedLookbookToken(lookbookToken)) {
    res.status(404).json({ error: "This link isn't valid." });
    return;
  }

  const [lookbook] = await db
    .select({
      id: lookbooksTable.id,
      organizationId: lookbooksTable.organizationId,
      shopId: lookbooksTable.shopId,
    })
    .from(lookbooksTable)
    .where(eq(lookbooksTable.token, lookbookToken))
    .limit(1);
  if (!lookbook) {
    res.status(404).json({ error: "This link isn't valid." });
    return;
  }

  const [created] = await db
    .insert(leadsTable)
    .values({
      organizationId: lookbook.organizationId,
      shopId: lookbook.shopId,
      lookbookId: lookbook.id,
      email: email.trim().toLowerCase(),
      name: name?.trim() ?? null,
      phone: phone?.trim() ?? null,
      source: "remote_flow",
    })
    .returning();

  res.status(201).json({ id: created!.id, email: created!.email, createdAt: created!.createdAt });
});

export default router;

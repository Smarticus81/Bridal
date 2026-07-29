import { Router, type IRouter } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, dressesTable, dressMediaTable, type DressStatus } from "@workspace/db";
import { CreateDressBody, ImportDressesBody, ListDressesQueryParams } from "@workspace/api-zod";
import { requireOrg, requireOwnerMutationOrigin } from "../lib/orgAuth.js";
import { dressCoverageStatus } from "../lib/dressCoverage.js";
import {
  diffInventory,
  summarizeDiff,
  type DressRowInput,
  type ExistingDress,
  type MappedRows,
} from "../lib/inventoryImport.js";

const router: IRouter = Router();

type DressRow = typeof dressesTable.$inferSelect;

/** Shape a catalog row for the API, adding the try-on-ready flag. Never leaks organizationId. */
function toDressResponse(row: DressRow, tryOnReady: boolean) {
  return {
    id: row.id,
    sku: row.sku,
    designer: row.designer,
    styleName: row.styleName,
    silhouette: row.silhouette,
    neckline: row.neckline,
    sleeve: row.sleeve,
    trainLength: row.trainLength,
    fabric: row.fabric,
    color: row.color,
    sizeRange: row.sizeRange,
    priceCents: row.priceCents,
    isConsignment: row.isConsignment,
    status: row.status,
    shopIds: row.shopIds,
    tryOnReady,
    createdAt: row.createdAt,
  };
}

// GET /dresses — the caller's organization catalog, with try-on readiness.
router.get("/dresses", async (req, res): Promise<void> => {
  const ctx = await requireOrg(req, res);
  if (!ctx) return;

  const query = ListDressesQueryParams.safeParse(req.query);
  const status = query.success ? query.data.status : undefined;

  const rows = await db
    .select()
    .from(dressesTable)
    .where(
      status
        ? and(eq(dressesTable.organizationId, ctx.org.id), eq(dressesTable.status, status))
        : eq(dressesTable.organizationId, ctx.org.id),
    )
    .orderBy(desc(dressesTable.createdAt));

  const ids = rows.map((row) => row.id);
  const media = ids.length
    ? await db
        .select({ dressId: dressMediaTable.dressId, coverage: dressMediaTable.coverage })
        .from(dressMediaTable)
        .where(inArray(dressMediaTable.dressId, ids))
    : [];

  const coverageByDress = new Map<number, Array<{ coverage: string }>>();
  for (const item of media) {
    const list = coverageByDress.get(item.dressId) ?? [];
    list.push({ coverage: item.coverage });
    coverageByDress.set(item.dressId, list);
  }

  const dresses = rows.map((row) =>
    toDressResponse(row, dressCoverageStatus(coverageByDress.get(row.id) ?? []).tryOnReady),
  );
  res.json({ dresses });
});

// POST /dresses — add a dress to the catalog (SKU unique per organization).
router.post("/dresses", async (req, res): Promise<void> => {
  if (!requireOwnerMutationOrigin(req, res)) return;
  const ctx = await requireOrg(req, res);
  if (!ctx) return;

  const parsed = CreateDressBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const body = parsed.data;
  const sku = body.sku.trim();
  const styleName = body.styleName.trim();
  if (!sku || !styleName) {
    res.status(400).json({ error: "SKU and style name are required" });
    return;
  }

  const [existing] = await db
    .select({ id: dressesTable.id })
    .from(dressesTable)
    .where(and(eq(dressesTable.organizationId, ctx.org.id), eq(dressesTable.sku, sku)))
    .limit(1);
  if (existing) {
    res.status(409).json({ error: `A dress with SKU ${sku} already exists in your catalog.` });
    return;
  }

  const [created] = await db
    .insert(dressesTable)
    .values({
      organizationId: ctx.org.id,
      sku,
      styleName,
      designer: body.designer ?? null,
      silhouette: body.silhouette ?? null,
      neckline: body.neckline ?? null,
      sleeve: body.sleeve ?? null,
      trainLength: body.trainLength ?? null,
      fabric: body.fabric ?? null,
      color: body.color ?? null,
      sizeRange: body.sizeRange ?? null,
      priceCents: body.priceCents ?? null,
      isConsignment: body.isConsignment ?? false,
      status: body.status ?? "in_stock",
      shopIds: body.shopIds ?? [],
    })
    .returning();

  // A freshly created dress has no media yet, so it is not try-on ready.
  res.status(201).json(toDressResponse(created!, false));
});

// POST /dresses/import — dry-run diff of a bulk import. Never writes.
router.post("/dresses/import", async (req, res): Promise<void> => {
  if (!requireOwnerMutationOrigin(req, res)) return;
  const ctx = await requireOrg(req, res);
  if (!ctx) return;

  const parsed = ImportDressesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Rows already passed schema validation (sku + styleName required, status enum),
  // so every row is a valid candidate; the CSV path is where invalid rows arise.
  const mapped: MappedRows = {
    valid: parsed.data.rows.map(
      (row): DressRowInput => ({
        sku: row.sku,
        styleName: row.styleName,
        designer: row.designer ?? null,
        silhouette: row.silhouette ?? null,
        neckline: row.neckline ?? null,
        sleeve: row.sleeve ?? null,
        trainLength: row.trainLength ?? null,
        fabric: row.fabric ?? null,
        color: row.color ?? null,
        sizeRange: row.sizeRange ?? null,
        priceCents: row.priceCents ?? null,
        status: row.status ?? "in_stock",
      }),
    ),
    invalid: [],
  };

  const existingRows = await db
    .select()
    .from(dressesTable)
    .where(eq(dressesTable.organizationId, ctx.org.id));
  const existing: ExistingDress[] = existingRows.map((row) => ({
    id: row.id,
    sku: row.sku,
    styleName: row.styleName,
    designer: row.designer,
    silhouette: row.silhouette,
    neckline: row.neckline,
    sleeve: row.sleeve,
    trainLength: row.trainLength,
    fabric: row.fabric,
    color: row.color,
    sizeRange: row.sizeRange,
    priceCents: row.priceCents,
    status: row.status as DressStatus,
  }));

  const diff = diffInventory(mapped, existing, { archiveMissing: parsed.data.archiveMissing ?? false });
  res.json({
    summary: summarizeDiff(diff),
    createCount: diff.create.length,
    updateCount: diff.update.length,
    archiveCount: diff.archive.length,
    unchangedCount: diff.unchanged.length,
    invalidCount: diff.invalid.length,
    invalid: diff.invalid,
  });
});

export default router;

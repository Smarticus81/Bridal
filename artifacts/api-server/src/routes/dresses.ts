import { Router, type IRouter } from "express";
import { and, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import {
  db,
  dressesTable,
  dressMediaTable,
  uploadIntentsTable,
  venuesTable,
  type DressStatus,
} from "@workspace/db";
import {
  AddDressMediaBody,
  AddDressMediaParams,
  CreateDressBody,
  ImportDressesBody,
  ListDressesQueryParams,
} from "@workspace/api-zod";
import { requireOrg, requireOwnerMutationOrigin } from "../lib/orgAuth.js";
import { dressCoverageStatus } from "../lib/dressCoverage.js";
import { filterDresses } from "../lib/dressFilters.js";
import {
  mimeTypeFromObjectPath,
  ObjectNotFoundError,
  ObjectStorageService,
} from "../lib/objectStorage.js";
import { assertReferenceImageQuality, MIN_REFERENCE_EDGE_PX } from "../lib/referenceImageQuality.js";

const objectStorageService = new ObjectStorageService();
const ALLOWED_DRESS_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_DRESS_UPLOAD_BYTES = 50 * 1024 * 1024;

/** Validate an uploaded dress photo with the same reference-quality path as venue media (§5.3). */
async function validateDressMediaObjectKey(objectKey: string): Promise<void> {
  if (!objectKey.startsWith("/objects/uploads/")) {
    throw new Error("Dress photo is not a valid uploaded object.");
  }
  try {
    const file = await objectStorageService.getObjectEntityFile(objectKey);
    const [buffer] = await file.download();
    if (buffer.length > MAX_DRESS_UPLOAD_BYTES) {
      throw new Error("Dress photo is too large. Upload images up to 50MB.");
    }
    const metadata = await file.getMetadata().catch(() => null);
    const contentType =
      metadata?.contentType && metadata.contentType !== "application/octet-stream"
        ? metadata.contentType
        : mimeTypeFromObjectPath(objectKey);
    if (!ALLOWED_DRESS_IMAGE_TYPES.has(contentType)) {
      throw new Error("Dress photo must be a JPG, PNG, or WebP image.");
    }
    await assertReferenceImageQuality({
      buffer,
      label: "Dress photo",
      minEdgePx: MIN_REFERENCE_EDGE_PX,
      profile: "venue",
    });
  } catch (err) {
    if (err instanceof ObjectNotFoundError) {
      throw new Error("Dress photo was not found. Upload it again.");
    }
    throw err;
  }
}
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

  const allDresses = rows.map((row) =>
    toDressResponse(row, dressCoverageStatus(coverageByDress.get(row.id) ?? []).tryOnReady),
  );

  // Consultant browse filters (§7), applied over the org-scoped catalog.
  const q = query.success ? query.data : {};
  const dresses = filterDresses(allDresses, {
    silhouette: q.silhouette,
    neckline: q.neckline,
    sleeve: q.sleeve,
    sizeRange: q.sizeRange,
    minPriceCents: q.minPriceCents,
    maxPriceCents: q.maxPriceCents,
    shopId: q.shopId,
    tryOnReadyOnly: q.tryOnReadyOnly,
  });
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

  // Apply the diff transactionally when requested; otherwise it stays a dry run
  // that writes nothing. Every write is org-scoped (create carries the org id;
  // update/archive target ids already confirmed to belong to this org above).
  const apply = parsed.data.apply === true;
  if (apply && (diff.create.length > 0 || diff.update.length > 0 || diff.archive.length > 0)) {
    await db.transaction(async (tx) => {
      if (diff.create.length > 0) {
        await tx.insert(dressesTable).values(
          diff.create.map((row) => ({
            organizationId: ctx.org.id,
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
            status: row.status ?? "in_stock",
          })),
        );
      }
      for (const item of diff.update) {
        await tx
          .update(dressesTable)
          .set({
            styleName: item.next.styleName,
            designer: item.next.designer,
            silhouette: item.next.silhouette,
            neckline: item.next.neckline,
            sleeve: item.next.sleeve,
            trainLength: item.next.trainLength,
            fabric: item.next.fabric,
            color: item.next.color,
            sizeRange: item.next.sizeRange,
            priceCents: item.next.priceCents,
            status: item.next.status ?? "in_stock",
          })
          .where(and(eq(dressesTable.id, item.id), eq(dressesTable.organizationId, ctx.org.id)));
      }
      if (diff.archive.length > 0) {
        await tx
          .update(dressesTable)
          .set({ status: "discontinued" })
          .where(
            and(
              eq(dressesTable.organizationId, ctx.org.id),
              inArray(dressesTable.id, diff.archive.map((d) => d.id)),
            ),
          );
      }
    });
  }

  res.json({
    summary: summarizeDiff(diff),
    applied: apply,
    createCount: diff.create.length,
    updateCount: diff.update.length,
    archiveCount: diff.archive.length,
    unchangedCount: diff.unchanged.length,
    invalidCount: diff.invalid.length,
    invalid: diff.invalid,
  });
});

// POST /dresses/:dressId/media — attach a coverage-tagged reference photo.
router.post("/dresses/:dressId/media", async (req, res): Promise<void> => {
  if (!requireOwnerMutationOrigin(req, res)) return;
  const ctx = await requireOrg(req, res);
  if (!ctx) return;

  const params = AddDressMediaParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = AddDressMediaBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  // The dress must be in the caller's catalog.
  const [dress] = await db
    .select({ id: dressesTable.id })
    .from(dressesTable)
    .where(and(eq(dressesTable.id, params.data.dressId), eq(dressesTable.organizationId, ctx.org.id)))
    .limit(1);
  if (!dress) {
    res.status(404).json({ error: "That dress isn't in your catalog." });
    return;
  }

  try {
    await validateDressMediaObjectKey(body.data.objectKey);
  } catch (err) {
    res.status(400).json({
      error:
        err instanceof Error
          ? err.message
          : "Dress photo is invalid. Upload a high-resolution JPG, PNG, or WebP image.",
    });
    return;
  }

  const [duplicate] = await db
    .select({ id: dressMediaTable.id })
    .from(dressMediaTable)
    .where(and(eq(dressMediaTable.dressId, dress.id), eq(dressMediaTable.objectKey, body.data.objectKey)))
    .limit(1);
  if (duplicate) {
    res.status(409).json({ error: "This photo is already attached to the dress." });
    return;
  }

  // The dress upload intent is scoped to a shop the org owns.
  const orgShops = await db
    .select({ id: venuesTable.id })
    .from(venuesTable)
    .where(eq(venuesTable.organizationId, ctx.org.id));
  const orgShopIds = orgShops.map((s) => s.id);
  if (orgShopIds.length === 0) {
    res.status(400).json({ error: "This upload is no longer valid. Upload the photo again." });
    return;
  }

  const media = await db.transaction(async (tx) => {
    const [intent] = await tx
      .update(uploadIntentsTable)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(uploadIntentsTable.objectKey, body.data.objectKey),
          inArray(uploadIntentsTable.venueId, orgShopIds),
          eq(uploadIntentsTable.purpose, "dress"),
          isNull(uploadIntentsTable.consumedAt),
          gte(uploadIntentsTable.expiresAt, new Date()),
        ),
      )
      .returning({ id: uploadIntentsTable.id });
    if (!intent) return null;

    const [created] = await tx
      .insert(dressMediaTable)
      .values({
        dressId: dress.id,
        objectKey: body.data.objectKey,
        coverage: body.data.coverage,
        displayOrder: body.data.displayOrder ?? 0,
      })
      .returning();
    return created ?? null;
  });

  if (!media) {
    res.status(409).json({ error: "This upload was already used. Upload the photo again." });
    return;
  }

  res.status(201).json(media);
});

export default router;

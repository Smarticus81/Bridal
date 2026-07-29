import { pgTable, text, serial, timestamp, integer, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

/**
 * The catalog subsystem. In veil a "shop" (the venues table, pre-rename) is a
 * storefront location under a billing organization; a shop stocks 200-600
 * dresses. This replaces glimpse's five static `venue_media` profile slots with
 * a real inventory: each dress is a SKU with garment metadata and a coverage-
 * tagged set of reference photos.
 */

export const DRESS_STATUSES = ["in_stock", "special_order", "discontinued"] as const;
export type DressStatus = (typeof DRESS_STATUSES)[number];

/**
 * Dress reference coverage slots, the bridal analogue of venue coverage. `front`
 * is required for try-on readiness exactly as venue coverage gated gallery
 * generation. The others sharpen garment fidelity but are optional.
 */
export const DRESS_MEDIA_COVERAGES = ["front", "back", "detail", "fabric", "on_model"] as const;
export type DressMediaCoverage = (typeof DRESS_MEDIA_COVERAGES)[number];

/** The single coverage slot that must be present for a dress to be try-on ready. */
export const REQUIRED_DRESS_MEDIA_COVERAGE: DressMediaCoverage = "front";

export const dressesTable = pgTable(
  "dresses",
  {
    id: serial("id").primaryKey(),
    // Isolation scope. Every catalog query filters by the caller's org.
    organizationId: integer("organization_id").notNull(),
    sku: text("sku").notNull(),
    designer: text("designer"),
    styleName: text("style_name").notNull(),
    silhouette: text("silhouette"),
    neckline: text("neckline"),
    sleeve: text("sleeve"),
    trainLength: text("train_length"),
    fabric: text("fabric"),
    color: text("color"),
    sizeRange: text("size_range"),
    priceCents: integer("price_cents"),
    isConsignment: boolean("is_consignment").notNull().default(false),
    status: text("status").notNull().default("in_stock"),
    // Which shop locations (venues.id) stock this dress. Array, not FK: a dress
    // can sit in several storefronts of the same retailer.
    shopIds: integer("shop_ids").array().notNull().default(sql`'{}'::int[]`),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    orgSkuUnique: uniqueIndex("dresses_org_sku_unique").on(table.organizationId, table.sku),
  }),
);

export const dressMediaTable = pgTable(
  "dress_media",
  {
    id: serial("id").primaryKey(),
    dressId: integer("dress_id").notNull().references(() => dressesTable.id, { onDelete: "cascade" }),
    objectKey: text("object_key").notNull(),
    coverage: text("coverage").notNull().default("front"),
    displayOrder: integer("display_order").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    dressObjectKeyUnique: uniqueIndex("dress_media_dress_object_key_unique").on(
      table.dressId,
      table.objectKey,
    ),
  }),
);

export const insertDressSchema = createInsertSchema(dressesTable).omit({ id: true, createdAt: true });
export const selectDressSchema = createSelectSchema(dressesTable);
export const insertDressMediaSchema = createInsertSchema(dressMediaTable).omit({ id: true, createdAt: true });
export const selectDressMediaSchema = createSelectSchema(dressMediaTable);

export type Dress = typeof dressesTable.$inferSelect;
export type InsertDress = typeof dressesTable.$inferInsert;
export type DressMedia = typeof dressMediaTable.$inferSelect;
export type InsertDressMedia = typeof dressMediaTable.$inferInsert;

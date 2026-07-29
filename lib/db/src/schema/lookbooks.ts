import { pgTable, text, serial, timestamp, integer, uniqueIndex } from "drizzle-orm/pg-core";
import { dressesTable } from "./dresses";

/**
 * A lookbook is a curated dress set the shop sends a bride for the remote
 * `/try/:lookbookToken` flow. Every lookbook has a credit cap and an expiry —
 * we never ship an uncapped, unexpiring link (spec §6.1). The purpose tag drives
 * the funnel: pre-appointment lead gen, post-appointment closing, or open catalog.
 */

export const LOOKBOOK_PURPOSES = ["pre_appointment", "post_appointment", "open_catalog"] as const;
export type LookbookPurpose = (typeof LOOKBOOK_PURPOSES)[number];

export const LOOKBOOK_STATUSES = ["active", "expired", "exhausted", "revoked"] as const;
export type LookbookStatus = (typeof LOOKBOOK_STATUSES)[number];

export const lookbooksTable = pgTable(
  "lookbooks",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id").notNull(),
    // The storefront (venues.id, pre-rename) that owns this lookbook.
    shopId: integer("shop_id").notNull(),
    // Opaque token in the /try/:lookbookToken URL. No account for the bride.
    token: text("token").notNull().unique(),
    purpose: text("purpose").notNull(),
    brideName: text("bride_name"),
    brideEmail: text("bride_email"),
    // Hard cap on looks generated through this link, and a hard expiry. Both
    // NOT NULL by design so a link can never be uncapped or unexpiring.
    creditCap: integer("credit_cap").notNull(),
    creditsUsed: integer("credits_used").notNull().default(0),
    expiresAt: timestamp("expires_at").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

export const lookbookDressesTable = pgTable(
  "lookbook_dresses",
  {
    id: serial("id").primaryKey(),
    lookbookId: integer("lookbook_id").notNull().references(() => lookbooksTable.id, { onDelete: "cascade" }),
    dressId: integer("dress_id").notNull().references(() => dressesTable.id, { onDelete: "cascade" }),
    displayOrder: integer("display_order").notNull().default(0),
  },
  (table) => ({
    lookbookDressUnique: uniqueIndex("lookbook_dresses_lookbook_dress_unique").on(
      table.lookbookId,
      table.dressId,
    ),
  }),
);

export type Lookbook = typeof lookbooksTable.$inferSelect;
export type InsertLookbook = typeof lookbooksTable.$inferInsert;
export type LookbookDress = typeof lookbookDressesTable.$inferSelect;
export type InsertLookbookDress = typeof lookbookDressesTable.$inferInsert;

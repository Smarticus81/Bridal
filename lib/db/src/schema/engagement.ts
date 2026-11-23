import { pgTable, text, serial, timestamp, integer, uniqueIndex } from "drizzle-orm/pg-core";
import { coupleSessionsTable, generatedAssetsTable } from "./sessions";
import { lookbooksTable } from "./lookbooks";

/**
 * Share-to-party reactions and commercial lead capture — the two engagement
 * surfaces that make the remote flow a funnel rather than a toy (spec §6.4-6.5).
 */

export const REACTION_KINDS = ["love", "maybe", "pass"] as const;
export type ReactionKind = (typeof REACTION_KINDS)[number];

export const reactionsTable = pgTable(
  "reactions",
  {
    id: serial("id").primaryKey(),
    // The bride session (couple_sessions, pre-rename) whose gallery is shared.
    sessionId: integer("session_id").notNull().references(() => coupleSessionsTable.id, { onDelete: "cascade" }),
    // The specific look being reacted to.
    generatedAssetId: integer("generated_asset_id").notNull().references(() => generatedAssetsTable.id, { onDelete: "cascade" }),
    // Anonymous per-viewer token — no account for viewers, ever.
    voterToken: text("voter_token").notNull(),
    kind: text("kind").notNull().default("love"),
    // Optional, captured post-vote only — never a wall in front of the gallery.
    voterEmail: text("voter_email"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    // One reaction per viewer per look.
    assetVoterUnique: uniqueIndex("reactions_asset_voter_unique").on(
      table.generatedAssetId,
      table.voterToken,
    ),
  }),
);

export const LEAD_SOURCES = ["remote_flow", "in_store", "share_view"] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const leadsTable = pgTable(
  "leads",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id").notNull(),
    shopId: integer("shop_id").notNull(),
    lookbookId: integer("lookbook_id").references(() => lookbooksTable.id, { onDelete: "set null" }),
    sessionId: integer("session_id").references(() => coupleSessionsTable.id, { onDelete: "set null" }),
    email: text("email").notNull(),
    name: text("name"),
    phone: text("phone"),
    source: text("source").notNull().default("remote_flow"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

export type Reaction = typeof reactionsTable.$inferSelect;
export type InsertReaction = typeof reactionsTable.$inferInsert;
export type Lead = typeof leadsTable.$inferSelect;
export type InsertLead = typeof leadsTable.$inferInsert;

import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { coupleSessionsTable } from "./sessions";
import { lookbooksTable } from "./lookbooks";

/**
 * Consent + retention ledger. Every bride photo is captured under an explicit,
 * timestamped consent recorded by the bride's own affirmative action — never
 * pre-checked, never tapped by a consultant on her behalf (spec §6.3). Texas
 * biometric-capture law and Illinois BIPA make this live legal exposure, so the
 * record is a first-class row, not a flag on the session.
 */

export const CONSENT_TYPES = ["image_use", "biometric"] as const;
export type ConsentType = (typeof CONSENT_TYPES)[number];

export const consentRecordsTable = pgTable("consent_records", {
  id: serial("id").primaryKey(),
  // The bride session (couple_sessions, pre-rename) the consent authorizes.
  sessionId: integer("session_id").references(() => coupleSessionsTable.id, { onDelete: "cascade" }),
  lookbookId: integer("lookbook_id").references(() => lookbooksTable.id, { onDelete: "set null" }),
  subjectEmail: text("subject_email").notNull(),
  consentType: text("consent_type").notNull().default("image_use"),
  // SHA-256 of the exact consented source photo, so QA and retention operate on
  // the same images the bride authorized.
  fingerprint: text("fingerprint"),
  // True only when set by the bride's own affirmative action.
  affirmative: boolean("affirmative").notNull().default(false),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  consentedAt: timestamp("consented_at").defaultNow().notNull(),
  // Per-shop retention TTL horizon. A purge job hard-deletes source photos and
  // derived assets from storage past this timestamp.
  retentionExpiresAt: timestamp("retention_expires_at"),
  revokedAt: timestamp("revoked_at"),
  // Set when the retention purge has hard-deleted this record's imagery and
  // scrubbed its biometric fingerprint. The row is retained as a consent audit
  // trail; a non-null value makes re-selection by the purge idempotent.
  purgedAt: timestamp("purged_at"),
});

/** Default per-shop retention window, in days, when a shop sets no override. */
export const DEFAULT_RETENTION_TTL_DAYS = 90;

export type ConsentRecord = typeof consentRecordsTable.$inferSelect;
export type InsertConsentRecord = typeof consentRecordsTable.$inferInsert;

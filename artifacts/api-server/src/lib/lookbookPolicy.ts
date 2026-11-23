// Import from the schema entrypoint (not the db index) so this pure module — and
// its unit test — never instantiate the Postgres pool.
import { DEFAULT_RETENTION_TTL_DAYS } from "@workspace/db/schema";
import type { ConsentRecord, Lookbook } from "@workspace/db/schema";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

type LinkState = Pick<Lookbook, "status" | "expiresAt">;

// Older rows can have status "exhausted". Their links reopen until their original expiry.
export function nextLookbookStatus(lookbook: LinkState, now: Date): "active" | "expired" | "revoked" {
  if (lookbook.status === "revoked") return "revoked";
  if (lookbook.status === "expired" || lookbook.expiresAt <= now) return "expired";
  return "active";
}

export function lookbookUsability(lookbook: LinkState, now: Date): { usable: true } | { usable: false; reason: "expired" | "revoked" } {
  const status = nextLookbookStatus(lookbook, now);
  return status === "active" ? { usable: true } : { usable: false, reason: status };
}

/**
 * The retention horizon for a consent record: the moment its source photo and
 * derived assets become purgeable. `ttlDays` is the per-shop override, defaulting
 * to 90 days.
 */
export function retentionExpiryFor(
  consentedAt: Date,
  ttlDays: number = DEFAULT_RETENTION_TTL_DAYS,
): Date {
  const days = Number.isFinite(ttlDays) && ttlDays > 0 ? ttlDays : DEFAULT_RETENTION_TTL_DAYS;
  return new Date(consentedAt.getTime() + days * MS_PER_DAY);
}

/**
 * Whether a consent record's assets should be hard-deleted now. A record is
 * purgeable if the subject revoked consent (delete-everything-about-me, §6.3),
 * or if its retention horizon has passed. Records with no horizon are treated as
 * not-yet-purgeable — a missing TTL must never silently drop a bride's data.
 */
export function isConsentPurgeable(
  record: Pick<ConsentRecord, "revokedAt" | "retentionExpiresAt" | "purgedAt">,
  now: Date,
): boolean {
  // Already purged — its imagery is gone and its fingerprint scrubbed. Never
  // re-select it, so the purge is idempotent.
  if (record.purgedAt) return false;
  if (record.revokedAt) return true;
  if (!record.retentionExpiresAt) return false;
  return record.retentionExpiresAt.getTime() <= now.getTime();
}

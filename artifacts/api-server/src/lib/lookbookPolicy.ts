// Import from the schema entrypoint (not the db index) so this pure module — and
// its unit test — never instantiate the Postgres pool.
import { DEFAULT_RETENTION_TTL_DAYS } from "@workspace/db/schema";
import type { ConsentRecord, Lookbook } from "@workspace/db/schema";

/**
 * Pure business rules for the remote lookbook flow and the consent/retention
 * ledger. Kept side-effect free so they can be unit-tested without a database:
 * the routes call these to decide whether a `/try/:lookbookToken` link may still
 * generate a look, and the purge job calls them to decide what to hard-delete.
 *
 * Two invariants encoded here:
 *  - A lookbook is never uncapped or unexpiring (§6.1): a link that is expired,
 *    revoked, or has burned its whole credit cap cannot generate another look.
 *  - Bride photos and derived assets are TTL-purged (§6.3, invariant 8): a
 *    consent record past its retention horizon is purgeable.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type LookbookUsability =
  | { usable: true }
  | { usable: false; reason: "expired" | "revoked" | "exhausted" };

/** Credits still available on a lookbook link (never negative). */
export function lookbookRemainingCredits(lookbook: Pick<Lookbook, "creditCap" | "creditsUsed">): number {
  return Math.max(0, lookbook.creditCap - lookbook.creditsUsed);
}

/**
 * Whether a lookbook link may generate one more look right now. Ordered so the
 * caller gets the most actionable reason first: a revoked link is revoked even
 * if also expired.
 */
export function lookbookUsability(
  lookbook: Pick<Lookbook, "status" | "creditCap" | "creditsUsed" | "expiresAt">,
  now: Date,
): LookbookUsability {
  if (lookbook.status === "revoked") return { usable: false, reason: "revoked" };
  if (lookbook.expiresAt.getTime() <= now.getTime()) return { usable: false, reason: "expired" };
  if (lookbookRemainingCredits(lookbook) <= 0) return { usable: false, reason: "exhausted" };
  return { usable: true };
}

/**
 * The status a lookbook should transition to given the clock and its burn.
 * `revoked` is terminal and never auto-changed. Used by a sweep job so the
 * shop's burn meter and link list reflect reality.
 */
export function nextLookbookStatus(
  lookbook: Pick<Lookbook, "status" | "creditCap" | "creditsUsed" | "expiresAt">,
  now: Date,
): Lookbook["status"] {
  if (lookbook.status === "revoked") return "revoked";
  if (lookbook.expiresAt.getTime() <= now.getTime()) return "expired";
  if (lookbookRemainingCredits(lookbook) <= 0) return "exhausted";
  return "active";
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
  record: Pick<ConsentRecord, "revokedAt" | "retentionExpiresAt">,
  now: Date,
): boolean {
  if (record.revokedAt) return true;
  if (!record.retentionExpiresAt) return false;
  return record.retentionExpiresAt.getTime() <= now.getTime();
}

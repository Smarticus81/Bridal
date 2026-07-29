import type { ConsentRecord } from "@workspace/db/schema";
import { isConsentPurgeable } from "./lookbookPolicy.js";

/**
 * Selects exactly what a retention purge must hard-delete (spec §6.3, invariant
 * 8). Bridal photos and everything derived from them are deletable and TTL-
 * purged — not soft-deleted — and the delete must reach Supabase storage. This
 * module is the pure selection core: given each bride session's consent state
 * and its object keys, it returns the flat set of storage keys and session ids
 * to remove. The route performs the actual storage + DB deletes and verifies
 * them; keeping selection pure makes the "what" testable without infrastructure.
 */

export interface SessionRetentionRecord {
  sessionId: number;
  consent: Pick<ConsentRecord, "revokedAt" | "retentionExpiresAt">;
  /** The bride's uploaded source photo object keys. */
  sourceObjectKeys: string[];
  /** Generated looks and any other derived asset object keys. */
  derivedObjectKeys: string[];
}

export type PurgeReason = "consent_revoked" | "retention_expired";

export interface PurgeTargets {
  sessionIds: number[];
  /** Every storage object key to hard-delete, de-duplicated. */
  objectKeys: string[];
  /** Per-session reason, for the audit trail. */
  reasons: Array<{ sessionId: number; reason: PurgeReason; objectKeyCount: number }>;
}

function reasonFor(consent: SessionRetentionRecord["consent"]): PurgeReason | null {
  if (consent.revokedAt) return "consent_revoked";
  if (consent.retentionExpiresAt) return "retention_expired";
  return null;
}

/**
 * Collect purge targets across sessions whose consent is purgeable now
 * (revoked, or past the retention horizon). A session with no retention horizon
 * and no revocation is never selected — a missing TTL must not silently drop a
 * bride's data.
 */
export function collectPurgeTargets(
  sessions: SessionRetentionRecord[],
  now: Date,
): PurgeTargets {
  const targets: PurgeTargets = { sessionIds: [], objectKeys: [], reasons: [] };
  const seenKeys = new Set<string>();

  for (const session of sessions) {
    if (!isConsentPurgeable(session.consent, now)) continue;
    const reason = reasonFor(session.consent);
    if (!reason) continue;

    targets.sessionIds.push(session.sessionId);
    const keys = [...session.sourceObjectKeys, ...session.derivedObjectKeys];
    for (const key of keys) {
      if (key && !seenKeys.has(key)) {
        seenKeys.add(key);
        targets.objectKeys.push(key);
      }
    }
    targets.reasons.push({ sessionId: session.sessionId, reason, objectKeyCount: keys.length });
  }

  return targets;
}

/**
 * "Delete everything about me" from any share link, no account (spec §6.3). This
 * is an immediate, unconditional purge of one session's source and derived
 * assets — it does not wait for the retention horizon. Returns the flat,
 * de-duplicated key set plus the session id.
 */
export function immediateSubjectPurge(session: SessionRetentionRecord): PurgeTargets {
  const keys = [...new Set([...session.sourceObjectKeys, ...session.derivedObjectKeys].filter(Boolean))];
  return {
    sessionIds: [session.sessionId],
    objectKeys: keys,
    reasons: [{ sessionId: session.sessionId, reason: "consent_revoked", objectKeyCount: keys.length }],
  };
}

/**
 * Per-org bulk purge for offboarding (spec §6.3): flatten every session's keys.
 * Unconditional — offboarding removes all bride imagery for the org regardless
 * of individual retention horizons.
 */
export function orgOffboardingPurge(sessions: SessionRetentionRecord[]): PurgeTargets {
  const seen = new Set<string>();
  const objectKeys: string[] = [];
  const reasons: PurgeTargets["reasons"] = [];
  for (const session of sessions) {
    const keys = [...session.sourceObjectKeys, ...session.derivedObjectKeys].filter(Boolean);
    for (const key of keys) {
      if (!seen.has(key)) {
        seen.add(key);
        objectKeys.push(key);
      }
    }
    reasons.push({ sessionId: session.sessionId, reason: "consent_revoked", objectKeyCount: keys.length });
  }
  return { sessionIds: sessions.map((s) => s.sessionId), objectKeys, reasons };
}

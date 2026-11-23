import { collectPurgeTargets, type SessionRetentionRecord } from "./retentionPurge.js";
import { logger } from "./logger.js";

/**
 * The retention purge *executor* — pure orchestration over injected ports, so
 * the sweep logic (which imagery is deleted, and which sessions are then
 * finalized) is unit-tested without a database or object store. The live ports
 * live in `retentionPurgeSweeper.ts`; this module never imports the DB, so it is
 * safe to load in tests.
 *
 * Correctness rule (invariant 8): a session's consent record is only marked
 * purged AFTER every one of its storage objects is confirmed deleted. A failed
 * storage delete leaves that session un-purged so the next sweep retries it —
 * a bride's imagery is never recorded as gone while it still exists in storage.
 */

export const RETENTION_PURGE_BATCH = 100;

export interface RetentionPurgeResult {
  scanned: number;
  sessionsPurged: number;
  objectsDeleted: number;
  objectsFailed: number;
}

export interface RetentionPurgeDeps {
  /** Load consent records due for purge (past horizon or revoked, not yet purged) with their object keys. */
  loadDueRecords: (now: Date, limit: number) => Promise<SessionRetentionRecord[]>;
  /** Hard-delete one storage object. Throws if the object could not be removed. */
  deleteObject: (objectKey: string) => Promise<void>;
  /** Delete derived/source rows and stamp each consent record purged (fingerprint scrubbed). */
  finalizePurge: (sessionIds: number[], now: Date) => Promise<void>;
}

export async function runRetentionPurge(
  deps: RetentionPurgeDeps,
  now: Date = new Date(),
): Promise<RetentionPurgeResult> {
  const records = await deps.loadDueRecords(now, RETENTION_PURGE_BATCH);
  const targets = collectPurgeTargets(records, now);
  if (targets.sessionIds.length === 0) {
    return { scanned: records.length, sessionsPurged: 0, objectsDeleted: 0, objectsFailed: 0 };
  }

  // Each object key is attempted exactly once (targets are de-duplicated across
  // sessions), so membership in `deleted` is an authoritative success signal.
  const deleted = new Set<string>();
  let objectsFailed = 0;
  for (const key of targets.objectKeys) {
    try {
      await deps.deleteObject(key);
      deleted.add(key);
    } catch (err) {
      objectsFailed += 1;
      logger.warn({ err, objectKey: key }, "retention purge: storage delete failed; will retry next sweep");
    }
  }

  // A session is finalized only when all of its imagery is confirmed deleted.
  const selected = new Set(targets.sessionIds);
  const finalizableSessionIds = records
    .filter((record) => selected.has(record.sessionId))
    .filter((record) =>
      [...record.sourceObjectKeys, ...record.derivedObjectKeys]
        .filter(Boolean)
        .every((key) => deleted.has(key)),
    )
    .map((record) => record.sessionId);

  if (finalizableSessionIds.length > 0) {
    await deps.finalizePurge(finalizableSessionIds, now);
  }

  logger.info(
    { sessionsPurged: finalizableSessionIds.length, objectsDeleted: deleted.size, objectsFailed },
    "retention purge swept expired/revoked bride imagery",
  );
  return {
    scanned: records.length,
    sessionsPurged: finalizableSessionIds.length,
    objectsDeleted: deleted.size,
    objectsFailed,
  };
}

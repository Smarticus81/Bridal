import { and, inArray, isNotNull, isNull, lt, or } from "drizzle-orm";
import {
  db,
  consentRecordsTable,
  generatedAssetsTable,
  coupleMediaTable,
} from "@workspace/db";
import type { SessionRetentionRecord } from "./retentionPurge.js";
import {
  runRetentionPurge,
  type RetentionPurgeDeps,
} from "./retentionPurgeExecutor.js";
import { logger } from "./logger.js";
import { ObjectStorageService } from "./objectStorage.js";

/**
 * Live wiring for the retention purge: the DB-backed ports plus a periodic
 * sweeper. Kept separate from the executor so the executor stays DB-free and
 * unit-testable. Only consent rows (which exist solely for bride try-on
 * sessions) are scanned, so gallery sessions are never touched.
 */

const storage = new ObjectStorageService();
const SWEEP_INTERVAL_MS = 60 * 60 * 1000; // hourly
let sweepTimer: ReturnType<typeof setInterval> | null = null;

async function loadDueRecords(now: Date, limit: number): Promise<SessionRetentionRecord[]> {
  const due = await db
    .select({
      sessionId: consentRecordsTable.sessionId,
      revokedAt: consentRecordsTable.revokedAt,
      retentionExpiresAt: consentRecordsTable.retentionExpiresAt,
      purgedAt: consentRecordsTable.purgedAt,
    })
    .from(consentRecordsTable)
    .where(
      and(
        isNull(consentRecordsTable.purgedAt),
        isNotNull(consentRecordsTable.sessionId),
        or(
          isNotNull(consentRecordsTable.revokedAt),
          and(
            isNotNull(consentRecordsTable.retentionExpiresAt),
            lt(consentRecordsTable.retentionExpiresAt, now),
          ),
        ),
      ),
    )
    .limit(limit);

  const sessionIds = due
    .map((row) => row.sessionId)
    .filter((id): id is number => id != null);
  if (sessionIds.length === 0) return [];

  const derived = await db
    .select({ sessionId: generatedAssetsTable.sessionId, objectKey: generatedAssetsTable.objectKey })
    .from(generatedAssetsTable)
    .where(inArray(generatedAssetsTable.sessionId, sessionIds));
  const source = await db
    .select({ sessionId: coupleMediaTable.sessionId, objectKey: coupleMediaTable.objectKey })
    .from(coupleMediaTable)
    .where(inArray(coupleMediaTable.sessionId, sessionIds));

  return due
    .filter((row): row is typeof row & { sessionId: number } => row.sessionId != null)
    .map((row) => ({
      sessionId: row.sessionId,
      consent: {
        revokedAt: row.revokedAt,
        retentionExpiresAt: row.retentionExpiresAt,
        purgedAt: row.purgedAt,
      },
      sourceObjectKeys: source.filter((s) => s.sessionId === row.sessionId).map((s) => s.objectKey),
      derivedObjectKeys: derived.filter((g) => g.sessionId === row.sessionId).map((g) => g.objectKey),
    }));
}

/**
 * Hard-delete the derived (generated look) and source (couple media) rows, then
 * scrub each consent record: null the biometric fingerprint and stamp purgedAt.
 * The consent row is retained as an audit trail that consent existed and was
 * honored, and the session + credit-transaction ledger are left intact for
 * financial audit.
 */
async function finalizePurge(sessionIds: number[], now: Date): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(generatedAssetsTable).where(inArray(generatedAssetsTable.sessionId, sessionIds));
    await tx.delete(coupleMediaTable).where(inArray(coupleMediaTable.sessionId, sessionIds));
    await tx
      .update(consentRecordsTable)
      .set({ fingerprint: null, purgedAt: now })
      .where(inArray(consentRecordsTable.sessionId, sessionIds));
  });
}

const liveDeps: RetentionPurgeDeps = {
  loadDueRecords,
  deleteObject: (objectKey) => storage.deleteObjectEntity(objectKey),
  finalizePurge,
};

function safeSweep(): void {
  runRetentionPurge(liveDeps).catch((err) => {
    logger.error({ err }, "Retention purge sweep failed");
  });
}

export function startRetentionPurgeSweeper(): void {
  if (sweepTimer) return;
  logger.info({ sweepIntervalMs: SWEEP_INTERVAL_MS }, "Retention purge sweeper started");
  safeSweep();
  sweepTimer = setInterval(safeSweep, SWEEP_INTERVAL_MS);
}

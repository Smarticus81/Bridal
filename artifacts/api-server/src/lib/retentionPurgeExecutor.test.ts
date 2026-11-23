import assert from "node:assert/strict";
import test from "node:test";
import { runRetentionPurge, type RetentionPurgeDeps } from "./retentionPurgeExecutor.js";
import type { SessionRetentionRecord } from "./retentionPurge.js";

const NOW = new Date("2026-07-29T00:00:00.000Z");
const past = new Date("2026-07-01T00:00:00.000Z");

function record(
  sessionId: number,
  keys: { source?: string[]; derived?: string[] },
): SessionRetentionRecord {
  return {
    sessionId,
    consent: { revokedAt: null, retentionExpiresAt: past, purgedAt: null },
    sourceObjectKeys: keys.source ?? [],
    derivedObjectKeys: keys.derived ?? [],
  };
}

function fakeDeps(
  records: SessionRetentionRecord[],
  failKeys: Set<string> = new Set(),
): RetentionPurgeDeps & { finalized: number[][]; deletedKeys: string[] } {
  const finalized: number[][] = [];
  const deletedKeys: string[] = [];
  return {
    finalized,
    deletedKeys,
    loadDueRecords: async () => records,
    deleteObject: async (key) => {
      if (failKeys.has(key)) throw new Error(`cannot delete ${key}`);
      deletedKeys.push(key);
    },
    finalizePurge: async (sessionIds) => {
      finalized.push(sessionIds);
    },
  };
}

test("nothing due is a clean no-op", async () => {
  const deps = fakeDeps([]);
  const result = await runRetentionPurge(deps, NOW);
  assert.deepEqual(result, { scanned: 0, sessionsPurged: 0, objectsDeleted: 0, objectsFailed: 0 });
  assert.equal(deps.finalized.length, 0);
});

test("all imagery deleted → the session is finalized (rows + fingerprint scrubbed)", async () => {
  const deps = fakeDeps([record(1, { source: ["s1"], derived: ["d1", "d2"] })]);
  const result = await runRetentionPurge(deps, NOW);
  assert.equal(result.sessionsPurged, 1);
  assert.equal(result.objectsDeleted, 3);
  assert.equal(result.objectsFailed, 0);
  assert.deepEqual(deps.finalized, [[1]]);
  assert.deepEqual(deps.deletedKeys.sort(), ["d1", "d2", "s1"]);
});

test("a failed storage delete holds its session back for the next sweep", async () => {
  const deps = fakeDeps(
    [
      record(1, { derived: ["ok1"] }),
      record(2, { source: ["stuck"], derived: ["ok2"] }),
    ],
    new Set(["stuck"]),
  );
  const result = await runRetentionPurge(deps, NOW);
  // Session 1 (all keys deleted) is finalized; session 2 (a stuck key) is not.
  assert.deepEqual(deps.finalized, [[1]]);
  assert.equal(result.sessionsPurged, 1);
  assert.equal(result.objectsFailed, 1);
});

test("a session with no imagery is still finalized (consent/audit purge)", async () => {
  const deps = fakeDeps([record(1, {})]);
  const result = await runRetentionPurge(deps, NOW);
  assert.deepEqual(deps.finalized, [[1]]);
  assert.equal(result.sessionsPurged, 1);
});

test("an already-purged record loaded by mistake is not finalized", async () => {
  const purged: SessionRetentionRecord = {
    sessionId: 9,
    consent: { revokedAt: past, retentionExpiresAt: past, purgedAt: past },
    sourceObjectKeys: ["x"],
    derivedObjectKeys: [],
  };
  const deps = fakeDeps([purged]);
  const result = await runRetentionPurge(deps, NOW);
  assert.equal(result.sessionsPurged, 0);
  assert.equal(deps.finalized.length, 0);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  collectPurgeTargets,
  immediateSubjectPurge,
  orgOffboardingPurge,
  type SessionRetentionRecord,
} from "./retentionPurge.js";

const NOW = new Date("2026-07-29T00:00:00.000Z");
const past = new Date("2026-07-01T00:00:00.000Z");
const future = new Date("2026-09-01T00:00:00.000Z");

type Consent = SessionRetentionRecord["consent"];
const consent = (over: Partial<Consent> = {}): Consent => ({
  revokedAt: null,
  retentionExpiresAt: null,
  purgedAt: null,
  ...over,
});

const mk = (over: Partial<SessionRetentionRecord> & { sessionId: number }): SessionRetentionRecord => ({
  consent: consent(),
  sourceObjectKeys: [],
  derivedObjectKeys: [],
  ...over,
});

test("expired retention is selected; future retention is not; missing horizon is not", () => {
  const sessions = [
    mk({ sessionId: 1, consent: consent({ retentionExpiresAt: past }), sourceObjectKeys: ["s1"], derivedObjectKeys: ["d1"] }),
    mk({ sessionId: 2, consent: consent({ retentionExpiresAt: future }), sourceObjectKeys: ["s2"] }),
    mk({ sessionId: 3, consent: consent(), sourceObjectKeys: ["s3"] }),
  ];
  const targets = collectPurgeTargets(sessions, NOW);
  assert.deepEqual(targets.sessionIds, [1]);
  assert.deepEqual(targets.objectKeys.sort(), ["d1", "s1"]);
  assert.equal(targets.reasons[0]!.reason, "retention_expired");
});

test("an already-purged record is never re-selected (idempotency)", () => {
  const sessions = [
    // Expired and revoked, but already purged — must be skipped.
    mk({ sessionId: 7, consent: consent({ revokedAt: past, retentionExpiresAt: past, purgedAt: past }), derivedObjectKeys: ["gone"] }),
  ];
  const targets = collectPurgeTargets(sessions, NOW);
  assert.deepEqual(targets.sessionIds, []);
  assert.deepEqual(targets.objectKeys, []);
});

test("revoked consent is selected even before the horizon", () => {
  const sessions = [
    mk({ sessionId: 5, consent: consent({ revokedAt: past, retentionExpiresAt: future }), sourceObjectKeys: ["x"] }),
  ];
  const targets = collectPurgeTargets(sessions, NOW);
  assert.deepEqual(targets.sessionIds, [5]);
  assert.equal(targets.reasons[0]!.reason, "consent_revoked");
});

test("object keys are de-duplicated across sessions", () => {
  const sessions = [
    mk({ sessionId: 1, consent: consent({ revokedAt: past }), sourceObjectKeys: ["shared"], derivedObjectKeys: ["a"] }),
    mk({ sessionId: 2, consent: consent({ revokedAt: past }), sourceObjectKeys: ["shared"], derivedObjectKeys: ["b"] }),
  ];
  const targets = collectPurgeTargets(sessions, NOW);
  assert.equal(targets.objectKeys.filter((k) => k === "shared").length, 1);
  assert.deepEqual(targets.objectKeys.sort(), ["a", "b", "shared"]);
});

test("immediate subject purge ignores the retention horizon entirely", () => {
  const session = mk({
    sessionId: 9,
    consent: consent({ retentionExpiresAt: future }), // not yet expired
    sourceObjectKeys: ["src", "src"], // dupe
    derivedObjectKeys: ["look1", "look2"],
  });
  const targets = immediateSubjectPurge(session);
  assert.deepEqual(targets.sessionIds, [9]);
  assert.deepEqual(targets.objectKeys.sort(), ["look1", "look2", "src"]);
});

test("org offboarding flattens every session unconditionally", () => {
  const sessions = [
    mk({ sessionId: 1, consent: consent({ retentionExpiresAt: future }), sourceObjectKeys: ["a"] }),
    mk({ sessionId: 2, consent: consent(), derivedObjectKeys: ["b"] }),
  ];
  const targets = orgOffboardingPurge(sessions);
  assert.deepEqual(targets.sessionIds, [1, 2]);
  assert.deepEqual(targets.objectKeys.sort(), ["a", "b"]);
});

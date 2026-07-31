import assert from "node:assert/strict";
import test from "node:test";
import {
  isConsentPurgeable,
  lookbookRemainingCredits,
  lookbookUsability,
  nextLookbookStatus,
  retentionExpiryFor,
} from "./lookbookPolicy.js";

const NOW = new Date("2026-07-29T00:00:00.000Z");
const future = new Date("2026-08-29T00:00:00.000Z");
const past = new Date("2026-07-01T00:00:00.000Z");

test("remaining credits never goes negative", () => {
  assert.equal(lookbookRemainingCredits({ creditCap: 8, creditsUsed: 3 }), 5);
  assert.equal(lookbookRemainingCredits({ creditCap: 8, creditsUsed: 8 }), 0);
  assert.equal(lookbookRemainingCredits({ creditCap: 8, creditsUsed: 99 }), 0);
});

test("an active, unexpired, uncapped link is usable", () => {
  assert.deepEqual(
    lookbookUsability({ status: "active", creditCap: 8, creditsUsed: 2, expiresAt: future }, NOW),
    { usable: true },
  );
});

test("revoked beats expired beats exhausted in the usability reason", () => {
  assert.deepEqual(
    lookbookUsability({ status: "revoked", creditCap: 8, creditsUsed: 0, expiresAt: past }, NOW),
    { usable: false, reason: "revoked" },
  );
  assert.deepEqual(
    lookbookUsability({ status: "active", creditCap: 8, creditsUsed: 0, expiresAt: past }, NOW),
    { usable: false, reason: "expired" },
  );
  assert.deepEqual(
    lookbookUsability({ status: "active", creditCap: 8, creditsUsed: 8, expiresAt: future }, NOW),
    { usable: false, reason: "exhausted" },
  );
});

test("expiry is boundary-inclusive: a link expiring exactly now is expired", () => {
  assert.deepEqual(
    lookbookUsability({ status: "active", creditCap: 8, creditsUsed: 0, expiresAt: NOW }, NOW),
    { usable: false, reason: "expired" },
  );
});

test("nextLookbookStatus reflects the clock and burn, and never resurrects revoked", () => {
  assert.equal(
    nextLookbookStatus({ status: "active", creditCap: 8, creditsUsed: 2, expiresAt: future }, NOW),
    "active",
  );
  assert.equal(
    nextLookbookStatus({ status: "active", creditCap: 8, creditsUsed: 8, expiresAt: future }, NOW),
    "exhausted",
  );
  assert.equal(
    nextLookbookStatus({ status: "active", creditCap: 8, creditsUsed: 0, expiresAt: past }, NOW),
    "expired",
  );
  assert.equal(
    nextLookbookStatus({ status: "revoked", creditCap: 8, creditsUsed: 0, expiresAt: future }, NOW),
    "revoked",
  );
});

test("retention horizon defaults to 90 days and honors a per-shop override", () => {
  const consentedAt = new Date("2026-01-01T00:00:00.000Z");
  assert.equal(retentionExpiryFor(consentedAt).toISOString(), "2026-04-01T00:00:00.000Z");
  assert.equal(retentionExpiryFor(consentedAt, 30).toISOString(), "2026-01-31T00:00:00.000Z");
  // A non-positive or invalid TTL falls back to the default rather than purging early.
  assert.equal(retentionExpiryFor(consentedAt, 0).toISOString(), "2026-04-01T00:00:00.000Z");
  assert.equal(retentionExpiryFor(consentedAt, -5).toISOString(), "2026-04-01T00:00:00.000Z");
});

test("consent is purgeable on revocation or past the horizon, never on a missing horizon", () => {
  assert.equal(isConsentPurgeable({ revokedAt: past, retentionExpiresAt: null, purgedAt: null }, NOW), true);
  assert.equal(isConsentPurgeable({ revokedAt: null, retentionExpiresAt: past, purgedAt: null }, NOW), true);
  assert.equal(isConsentPurgeable({ revokedAt: null, retentionExpiresAt: future, purgedAt: null }, NOW), false);
  // Missing horizon must never silently drop a bride's data.
  assert.equal(isConsentPurgeable({ revokedAt: null, retentionExpiresAt: null, purgedAt: null }, NOW), false);
  // Already purged is never re-selected, even when revoked and past the horizon.
  assert.equal(isConsentPurgeable({ revokedAt: past, retentionExpiresAt: past, purgedAt: past }, NOW), false);
});

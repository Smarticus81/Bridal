import assert from "node:assert/strict";
import test from "node:test";
import {
  isConsentPurgeable,
  lookbookUsability,
  nextLookbookStatus,
  retentionExpiryFor,
} from "./lookbookPolicy.js";

const NOW = new Date("2026-07-29T00:00:00.000Z");
const future = new Date("2026-08-29T00:00:00.000Z");
const past = new Date("2026-07-01T00:00:00.000Z");

test("existing exhausted and over-cap lookbooks reopen until expiry", () => {
  for (const status of ["active", "exhausted"]) {
    const legacy = { status, creditCap: 1, creditsUsed: 150, expiresAt: future };
    assert.deepEqual(lookbookUsability(legacy, NOW), { usable: true });
    assert.equal(nextLookbookStatus(legacy, NOW), "active");
  }
});

test("revocation and expiry still close a lookbook", () => {
  for (const [status, expiresAt, reason] of [
    ["revoked", past, "revoked"], ["active", NOW, "expired"], ["exhausted", past, "expired"], ["expired", future, "expired"],
  ] as const) {
    assert.deepEqual(lookbookUsability({ status, expiresAt }, NOW), { usable: false, reason });
  }
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

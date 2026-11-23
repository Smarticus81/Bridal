import assert from "node:assert/strict";
import test from "node:test";
import { reserveUploadSlot, releaseSubmittedPhoto } from "./rateLimit.js";
import { LOOK_CREDIT_COST, decideLookDebit } from "./lookDebit.js";

test("one look costs exactly one credit", () => {
  assert.equal(LOOK_CREDIT_COST, 1);
});

test("happy path decrements the org balance and increments lookbook usage", () => {
  const d = decideLookDebit({ creditsUsed: 2, orgCreditsBalance: 50 });
  assert.deepEqual(d, { ok: true, cost: 1, nextCreditsUsed: 3, nextOrgBalance: 49 });
});

test("past usage never prevents another funded look", () => {
  assert.deepEqual(decideLookDebit({ creditsUsed: 150, orgCreditsBalance: 1 }), {
    ok: true, cost: 1, nextCreditsUsed: 151, nextOrgBalance: 0,
  });
});

test("insufficient org credits is refused", () => {
  const d = decideLookDebit({ creditsUsed: 0, orgCreditsBalance: 0 });
  assert.deepEqual(d, { ok: false, reason: "insufficient_org_credits" });
});

test("completed bridal uploads do not exhaust the address while unused URLs remain bounded", () => {
  const ip = "try-on-test";
  for (let i = 0; i < 240; i++) {
    const register = reserveUploadSlot(ip);
    assert.ok(register);
    register(String(i));
    releaseSubmittedPhoto(ip, String(i));
  }
  for (let i = 0; i < 120; i++) reserveUploadSlot(ip)!(String(i));
  assert.equal(reserveUploadSlot(ip), undefined);
  releaseSubmittedPhoto("different-address", "0");
  releaseSubmittedPhoto(ip, "not-issued");
  assert.equal(reserveUploadSlot(ip), undefined);
  releaseSubmittedPhoto(ip, "0");
  releaseSubmittedPhoto(ip, "0");
  assert.ok(reserveUploadSlot(ip));
  assert.equal(reserveUploadSlot(ip), undefined);
});

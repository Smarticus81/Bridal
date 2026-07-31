import assert from "node:assert/strict";
import test from "node:test";
import { LOOK_CREDIT_COST, decideLookDebit } from "./lookDebit.js";

test("one look costs exactly one credit", () => {
  assert.equal(LOOK_CREDIT_COST, 1);
});

test("happy path decrements the org balance and increments lookbook usage", () => {
  const d = decideLookDebit({ creditCap: 8, creditsUsed: 2, orgCreditsBalance: 50 });
  assert.deepEqual(d, { ok: true, cost: 1, nextCreditsUsed: 3, nextOrgBalance: 49 });
});

test("the last credit on the cap is still chargeable (boundary)", () => {
  const d = decideLookDebit({ creditCap: 8, creditsUsed: 7, orgCreditsBalance: 5 });
  assert.equal(d.ok, true);
  assert.equal(d.ok && d.nextCreditsUsed, 8);
});

test("an exhausted lookbook is refused before touching org credits", () => {
  const d = decideLookDebit({ creditCap: 8, creditsUsed: 8, orgCreditsBalance: 100 });
  assert.deepEqual(d, { ok: false, reason: "lookbook_exhausted" });
});

test("insufficient org credits is refused even when the lookbook has room", () => {
  const d = decideLookDebit({ creditCap: 8, creditsUsed: 0, orgCreditsBalance: 0 });
  assert.deepEqual(d, { ok: false, reason: "insufficient_org_credits" });
});

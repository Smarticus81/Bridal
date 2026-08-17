import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateBridePhoto,
  photoGatePrecedesBilling,
  type BridePhotoAnalysis,
} from "./photoGate.js";

const good: BridePhotoAnalysis = {
  minEdgePx: 1024,
  brightness: 140,
  sharpness: 40,
  personCount: 1,
  fullBody: true,
  armsAtSides: true,
  containsMinor: false,
  disallowedContent: false,
};

test("a clean full-body solo photo passes", () => {
  assert.deepEqual(evaluateBridePhoto(good), { ok: true });
});

test("a minor is a hard block, ahead of every other check", () => {
  // Even with every other signal also bad, the minor block wins.
  const r = evaluateBridePhoto({
    ...good,
    containsMinor: true,
    personCount: 3,
    fullBody: false,
    minEdgePx: 10,
  });
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.code, "minor_blocked");
});

test("disallowed content is blocked before framing checks", () => {
  const r = evaluateBridePhoto({ ...good, disallowedContent: true, fullBody: false });
  assert.equal(r.ok === false && r.code, "disallowed_content");
});

test("no person and multiple people get distinct, specific reasons", () => {
  const none = evaluateBridePhoto({ ...good, personCount: 0 });
  assert.equal(none.ok === false && none.code, "no_person");
  assert.match(none.ok === false ? none.reason : "", /can't find you/);

  const many = evaluateBridePhoto({ ...good, personCount: 2 });
  assert.equal(many.ok === false && many.code, "multiple_people");
  assert.match(many.ok === false ? many.reason : "", /more than one person/);
});

test("quality gates fire with actionable reasons", () => {
  assert.equal(evaluateBridePhoto({ ...good, minEdgePx: 200 }).ok === false && "too_small", "too_small");
  const dark = evaluateBridePhoto({ ...good, brightness: 10 });
  assert.equal(dark.ok === false && dark.code, "too_dark");
  const bright = evaluateBridePhoto({ ...good, brightness: 250 });
  assert.equal(bright.ok === false && bright.code, "too_bright");
  const blur = evaluateBridePhoto({ ...good, sharpness: 1 });
  assert.equal(blur.ok === false && blur.code, "blurry");
});

test("cropped-below-knees is rejected with the exact spec reason", () => {
  const r = evaluateBridePhoto({ ...good, fullBody: false });
  assert.equal(r.ok === false && r.code, "not_full_body");
  assert.match(r.ok === false ? r.reason : "", /below your knees/);
});

test("crossed arms rejected only when explicitly false, not when unknown", () => {
  assert.equal(evaluateBridePhoto({ ...good, armsAtSides: false }).ok, false);
  // undefined (not analyzed) must not block.
  const { armsAtSides: _omit, ...noArms } = good;
  assert.equal(evaluateBridePhoto(noArms).ok, true);
});

test("no rejection reason is the generic 'invalid image'", () => {
  const cases: BridePhotoAnalysis[] = [
    { ...good, containsMinor: true },
    { ...good, personCount: 0 },
    { ...good, personCount: 2 },
    { ...good, minEdgePx: 10 },
    { ...good, brightness: 5 },
    { ...good, sharpness: 0 },
    { ...good, fullBody: false },
    { ...good, armsAtSides: false },
  ];
  for (const c of cases) {
    const r = evaluateBridePhoto(c);
    assert.equal(r.ok, false);
    assert.doesNotMatch(r.ok === false ? r.reason : "", /invalid image/i);
  }
});

test("the gate must precede billing so retries are free", () => {
  assert.equal(photoGatePrecedesBilling({ gateEvaluatedAtStep: 1, creditDebitedAtStep: 2 }), true);
  assert.equal(photoGatePrecedesBilling({ gateEvaluatedAtStep: 3, creditDebitedAtStep: 2 }), false);
});

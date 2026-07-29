import assert from "node:assert/strict";
import test from "node:test";
import {
  FLOOR_GARMENT_FIDELITY_SCORE,
  MIN_BODY_PROPORTION_SCORE,
  MIN_GARMENT_FIDELITY_SCORE,
  TryonQualityError,
  VISUALIZATION_DISCLAIMER,
  garmentRetryGuidanceForError,
  lookQualityScore,
  normalizeTryonReport,
  tryonAcceptanceFloorFailures,
  tryonThresholdFailures,
  type TryonQualityReport,
} from "./tryonQuality.js";

const passing: TryonQualityReport = {
  brideLikenessScore: 0.9,
  garmentFidelityScore: 0.92,
  bodyProportionScore: 0.9,
  compositionScore: 0.8,
  exactlyOnePerson: true,
  faceVisible: true,
  extraPeople: false,
  textArtifacts: false,
  pass: true,
  reasons: [],
};

test("garment fidelity target is 0.88, above venue's 0.80", () => {
  assert.equal(MIN_GARMENT_FIDELITY_SCORE, 0.88);
});

test("a fully-passing report has no threshold failures", () => {
  assert.deepEqual(tryonThresholdFailures(passing), []);
});

test("garment fidelity between floor and target fails the strict gate", () => {
  const r = { ...passing, garmentFidelityScore: 0.84 };
  const failures = tryonThresholdFailures(r);
  assert.ok(failures.some((f) => f.includes("garment fidelity")));
  // ...but it clears the acceptance floor (goes to the consultant, not the bride).
  assert.ok(!tryonAcceptanceFloorFailures(r).some((f) => f.includes("garment fidelity")));
  assert.ok(0.84 >= FLOOR_GARMENT_FIDELITY_SCORE);
});

test("body proportion below 0.85 is non-negotiable — it fails even the acceptance floor", () => {
  const r = { ...passing, bodyProportionScore: 0.8 };
  assert.ok(tryonThresholdFailures(r).some((f) => f.includes("body proportion")));
  assert.ok(tryonAcceptanceFloorFailures(r).some((f) => f.includes("body proportion")));
  assert.equal(MIN_BODY_PROPORTION_SCORE, 0.85);
});

test("integrity failures block delivery at every tier", () => {
  const extra = { ...passing, extraPeople: true };
  assert.ok(tryonAcceptanceFloorFailures(extra).some((f) => f.includes("extra people")));
  const twoPeople = { ...passing, exactlyOnePerson: false };
  assert.ok(tryonAcceptanceFloorFailures(twoPeople).some((f) => f.includes("exactly one person")));
});

test("lookQualityScore weights garment fidelity highest", () => {
  const strongGarment = lookQualityScore({ ...passing, garmentFidelityScore: 1, brideLikenessScore: 0, bodyProportionScore: 0, compositionScore: 0 });
  const strongLikeness = lookQualityScore({ ...passing, garmentFidelityScore: 0, brideLikenessScore: 1, bodyProportionScore: 0, compositionScore: 0 });
  assert.ok(strongGarment > strongLikeness);
  assert.ok(Math.abs(strongGarment - 0.4) < 1e-9);
});

test("retry guidance names weak garment detail and never suggests altering the body", () => {
  const r = { ...passing, garmentFidelityScore: 0.5, pass: false };
  const err = new TryonQualityError("x", r, { buffer: Buffer.alloc(0), mimeType: "image/jpeg" }, "gemini-3-pro-image");
  const guidance = garmentRetryGuidanceForError(err) ?? "";
  assert.ok(guidance.includes("reproduce the exact dress"));
  assert.ok(guidance.includes("do not invent, add, or omit garment details"));
  assert.ok(guidance.includes("altering her body proportions"));
});

test("retry guidance for weak body proportion says preserve, never slim", () => {
  const r = { ...passing, bodyProportionScore: 0.6, pass: false };
  const err = new TryonQualityError("x", r, { buffer: Buffer.alloc(0), mimeType: "image/jpeg" }, "m");
  const guidance = garmentRetryGuidanceForError(err) ?? "";
  assert.ok(guidance.includes("preserve the bride's real body proportions"));
  assert.ok(guidance.includes("do not slim, lengthen, or reshape"));
});

test("non-TryonQualityError yields no guidance", () => {
  assert.equal(garmentRetryGuidanceForError(new Error("boom")), null);
});

test("normalizeTryonReport clamps scores and coerces booleans", () => {
  const r = normalizeTryonReport({
    brideLikenessScore: 1.5,
    garmentFidelityScore: -3,
    bodyProportionScore: "0.9",
    compositionScore: "not-a-number",
    exactlyOnePerson: true,
    faceVisible: "yes",
    extraPeople: false,
    textArtifacts: false,
    pass: true,
    reasons: ["ok", 5],
  });
  assert.equal(r.brideLikenessScore, 1);
  assert.equal(r.garmentFidelityScore, 0);
  assert.equal(r.bodyProportionScore, 0.9);
  assert.equal(r.compositionScore, 0);
  assert.equal(r.faceVisible, false); // only strict `true` counts
  assert.deepEqual(r.reasons, ["ok"]);
});

test("the visualization disclaimer is the exact required string", () => {
  assert.equal(
    VISUALIZATION_DISCLAIMER,
    "Visualization only — not a representation of fit, size, or exact fabric.",
  );
});

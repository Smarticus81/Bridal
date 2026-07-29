import assert from "node:assert/strict";
import test from "node:test";
import { generateLookWithQuality, type GeneratedLookImage } from "./lookGeneration.js";
import { TryonQualityError, type TryonQualityReport } from "./tryonQuality.js";

const dress = { styleName: "Aurora", neckline: "sweetheart", silhouette: "A-line" };

const img = (model = "gemini-3-pro-image"): GeneratedLookImage => ({
  buffer: Buffer.from("img"),
  mimeType: "image/jpeg",
  model,
});

const report = (over: Partial<TryonQualityReport>): TryonQualityReport => ({
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
  ...over,
});

const failWith = (r: TryonQualityReport) =>
  new TryonQualityError("fail", r, { buffer: Buffer.from("img"), mimeType: "image/jpeg" }, "gemini-3-pro-image");

test("passes on the first attempt when the judge accepts", async () => {
  let generated = 0;
  const result = await generateLookWithQuality({
    dress,
    generate: async () => { generated += 1; return img(); },
    judge: async () => report({}),
  });
  assert.equal(result.attempts, 1);
  assert.equal(result.escalated, false);
  assert.equal(result.consultantReview, false);
  assert.equal(generated, 1);
});

test("retries with adaptive guidance and succeeds on a later attempt", async () => {
  const prompts: string[] = [];
  let calls = 0;
  const result = await generateLookWithQuality({
    dress,
    attempts: 4,
    generate: async (prompt) => { prompts.push(prompt); return img(); },
    judge: async () => {
      calls += 1;
      if (calls < 3) throw failWith(report({ pass: false, garmentFidelityScore: 0.5, reasons: ["weak lace"] }));
      return report({});
    },
  });
  assert.equal(result.attempts, 3);
  assert.equal(result.escalated, true);
  // The retry prompt carries the correction guidance.
  assert.ok(prompts[1]!.includes("QUALITY RETRY CORRECTION"));
});

test("floor-delivers the best attempt to the consultant when the target is never hit", async () => {
  // Between floor and target on garment fidelity, but integrity + body proportion OK.
  const nearMiss = report({ pass: false, garmentFidelityScore: 0.84 });
  const result = await generateLookWithQuality({
    dress,
    attempts: 2,
    generate: async () => img(),
    judge: async () => { throw failWith(nearMiss); },
  });
  assert.equal(result.consultantReview, true);
  assert.equal(result.escalated, true);
  assert.equal(result.report.garmentFidelityScore, 0.84);
});

test("throws when even the best attempt fails the acceptance floor (body proportion)", async () => {
  // Body proportion below 0.85 is non-negotiable — never floor-delivered.
  const bad = report({ pass: false, bodyProportionScore: 0.6 });
  await assert.rejects(
    generateLookWithQuality({
      dress,
      attempts: 2,
      generate: async () => img(),
      judge: async () => { throw failWith(bad); },
    }),
    (err: unknown) => err instanceof TryonQualityError,
  );
});

test("keeps the highest-scoring attempt as the floor delivery", async () => {
  const reports = [
    report({ pass: false, garmentFidelityScore: 0.80 }),
    report({ pass: false, garmentFidelityScore: 0.86 }), // best
    report({ pass: false, garmentFidelityScore: 0.82 }),
  ];
  let i = 0;
  const result = await generateLookWithQuality({
    dress,
    attempts: 3,
    generate: async () => img(),
    judge: async () => { throw failWith(reports[i++]!); },
  });
  assert.equal(result.report.garmentFidelityScore, 0.86);
});

test("attempts are clamped to [1,6]", async () => {
  let calls = 0;
  await assert.rejects(
    generateLookWithQuality({
      dress,
      attempts: 99,
      generate: async () => img(),
      judge: async () => { calls += 1; throw failWith(report({ pass: false, bodyProportionScore: 0.1 })); },
    }),
  );
  assert.equal(calls, 6);
});

test("a non-quality error aborts the loop immediately", async () => {
  let calls = 0;
  await assert.rejects(
    generateLookWithQuality({
      dress,
      generate: async () => img(),
      judge: async () => { calls += 1; throw new Error("network down"); },
    }),
    /network down/,
  );
  assert.equal(calls, 1);
});

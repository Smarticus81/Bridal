import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { runTryonLook } from "./runTryonLook.js";
import { TryonQualityError, type TryonQualityReport } from "./tryonQuality.js";
import type { GeneratedLookImage } from "./lookGeneration.js";

async function samplePortrait(): Promise<Buffer> {
  const subject = new URL("../../../../samples/tryon/subject.jpg", import.meta.url);
  return sharp(subject.pathname).resize(1152, 1536, { fit: "cover" }).jpeg({ quality: 95 }).toBuffer();
}

const pass: TryonQualityReport = {
  brideLikenessScore: 0.9,
  garmentFidelityScore: 0.92,
  bodyProportionScore: 0.9,
  compositionScore: 0.82,
  exactlyOnePerson: true,
  faceVisible: true,
  extraPeople: false,
  textArtifacts: false,
  pass: true,
  reasons: [],
};

const dress = { styleName: "Aurora", neckline: "sweetheart", silhouette: "A-line" };

test("delivers the same color-preserving JPEG the judge reviewed", async () => {
  const raw = await samplePortrait();
  let reviewed: Buffer | undefined;
  const result = await runTryonLook({
    sessionId: 1,
    dress,
    brideReferences: [{ buffer: raw, mimeType: "image/jpeg" }],
    dressReferences: [{ buffer: raw, mimeType: "image/jpeg", coverage: "front" }],
    generate: async (): Promise<GeneratedLookImage> => ({ buffer: raw, mimeType: "image/jpeg", model: "gemini-3-pro-image" }),
    judge: async image => { reviewed = image.buffer; return pass; },
  });
  assert.equal(result.model, "gemini-3-pro-image");
  assert.equal(result.attempts, 1);
  assert.equal(result.consultantReview, false);
  assert.equal(result.report.garmentFidelityScore, 0.92);
  // The polished output is a valid JPEG (has real bytes and decodes).
  assert.deepEqual(result.polished, reviewed);
  const meta = await sharp(result.polished).metadata();
  assert.equal(meta.format, "jpeg");
});

test("surfaces consultant-review floor delivery from the engine", async () => {
  const raw = await samplePortrait();
  const nearMiss: TryonQualityReport = { ...pass, pass: false, garmentFidelityScore: 0.84 };
  const result = await runTryonLook({
    sessionId: 2,
    dress,
    attempts: 2,
    brideReferences: [{ buffer: raw, mimeType: "image/jpeg" }],
    dressReferences: [{ buffer: raw, mimeType: "image/jpeg" }],
    generate: async () => ({ buffer: raw, mimeType: "image/jpeg", model: "m" }),
    judge: async () => {
      throw new TryonQualityError("x", nearMiss, { buffer: raw, mimeType: "image/jpeg" }, "m");
    },
  });
  assert.equal(result.consultantReview, true);
  assert.equal(result.report.garmentFidelityScore, 0.84);
});

import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { runTryonLook } from "./runTryonLook.js";
import { TryonQualityError, type TryonQualityReport } from "./tryonQuality.js";
import type { GeneratedLookImage } from "./lookGeneration.js";

async function solidJpeg(): Promise<Buffer> {
  return sharp({ create: { width: 64, height: 96, channels: 3, background: { r: 200, g: 190, b: 180 } } })
    .jpeg()
    .toBuffer();
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

test("composes generate -> judge -> polish and returns a polished JPEG", async () => {
  const raw = await solidJpeg();
  const result = await runTryonLook({
    sessionId: 1,
    dress,
    brideReferences: [{ buffer: raw, mimeType: "image/jpeg" }],
    dressReferences: [{ buffer: raw, mimeType: "image/jpeg", coverage: "front" }],
    generate: async (): Promise<GeneratedLookImage> => ({ buffer: raw, mimeType: "image/jpeg", model: "gemini-3-pro-image" }),
    judge: async () => pass,
  });
  assert.equal(result.model, "gemini-3-pro-image");
  assert.equal(result.attempts, 1);
  assert.equal(result.consultantReview, false);
  assert.equal(result.report.garmentFidelityScore, 0.92);
  // The polished output is a valid JPEG (has real bytes and decodes).
  assert.ok(result.polished.length > 0);
  const meta = await sharp(result.polished).metadata();
  assert.equal(meta.format, "jpeg");
});

test("surfaces consultant-review floor delivery from the engine", async () => {
  const raw = await solidJpeg();
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

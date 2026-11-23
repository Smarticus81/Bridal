import { createTryonGenerator, type ReferenceImage } from "./tryonImageClient.js";
import { generateLookWithQuality, type GeneratedLookImage } from "./lookGeneration.js";
import { assertTryonLookQuality, type TryonQualityReport } from "./tryonQuality.js";
import sharp from "sharp";
import { prepareReferenceImage } from "./referenceImagePreparation.js";
import { validateGeneratedStill } from "./stillImageClient.js";
import { dressSummary, type DressPromptFacets } from "./tryonPrompt.js";
import type { DressMediaCoverage } from "./dressCoverage.js";

/** Prepare color-preserving inputs and deliver the same JPEG evaluated by the judge. */
export interface DressReference extends ReferenceImage {
  coverage?: DressMediaCoverage | null;
}

export interface TryonLookResult {
  /** Branded, polished JPEG ready to upload. */
  polished: Buffer;
  mimeType: string;
  model: string;
  attempts: number;
  /** True when floor-delivered for consultant review rather than passing the strict target. */
  consultantReview: boolean;
  report: TryonQualityReport;
}

/** A report standing in for a disabled quality gate (production always keeps it on). */
const GATE_DISABLED_REPORT: TryonQualityReport = {
  brideLikenessScore: 1,
  garmentFidelityScore: 1,
  bodyProportionScore: 1,
  compositionScore: 1,
  exactlyOnePerson: true,
  faceVisible: true,
  extraPeople: false,
  textArtifacts: false,
  pass: true,
  reasons: ["quality gate disabled"],
};

export async function runTryonLook(params: {
  sessionId: number;
  dress: DressPromptFacets;
  brideReferences: ReferenceImage[];
  dressReferences: DressReference[];
  attempts?: number;
  generate?: (prompt: string, attempt: number) => Promise<GeneratedLookImage>;
  judge?: (image: GeneratedLookImage) => Promise<TryonQualityReport>;
}): Promise<TryonLookResult> {
  const summary = dressSummary(params.dress);

  async function prepare<T extends ReferenceImage>(references: T[]) {
    const prepared: T[] = [];
    for (const ref of references) {
      const { buffer } = await prepareReferenceImage({ ...ref, preserveColor: true });
      prepared.push({ ...ref, buffer, mimeType: "image/jpeg" });
    }
    return prepared;
  }
  const brideReferences = await prepare(params.brideReferences);
  const dressReferences = await prepare(params.dressReferences);
  const generate =
    params.generate ??
    createTryonGenerator({
      brideReferences,
      dressReferences,
    });

  const judge =
    params.judge ??
    (async (image: GeneratedLookImage): Promise<TryonQualityReport> => {
      const report = await assertTryonLookQuality({
        sessionId: params.sessionId,
        dressSummary: summary,
        generated: image,
        generatedModel: image.model,
        brideReferences,
        dressReferences,
      });
      // assertTryonLookQuality returns null only when the gate is disabled.
      return report ?? GATE_DISABLED_REPORT;
    });

  const result = await generateLookWithQuality({
    dress: params.dress,
    attempts: params.attempts,
    generate: async (prompt, attempt) => {
      const image = await generate(prompt, attempt);
      const buffer = await sharp(image.buffer, { limitInputPixels: 64_000_000 })
        .rotate().toColourspace("srgb").jpeg({ quality: 95, chromaSubsampling: "4:4:4", mozjpeg: true }).toBuffer();
      await validateGeneratedStill(buffer, "3:4");
      return { ...image, buffer, mimeType: "image/jpeg" };
    },
    judge,
  });

  const polished = result.image.buffer;

  return {
    polished,
    mimeType: "image/jpeg",
    model: result.image.model,
    attempts: result.attempts,
    consultantReview: result.consultantReview,
    report: result.report,
  };
}

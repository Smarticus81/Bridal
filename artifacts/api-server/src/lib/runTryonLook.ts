import { createTryonGenerator, type ReferenceImage } from "./tryonImageClient.js";
import { generateLookWithQuality, type GeneratedLookImage } from "./lookGeneration.js";
import { assertTryonLookQuality, type TryonQualityReport } from "./tryonQuality.js";
import { polishGalleryFrame } from "./galleryFrame.js";
import { dressSummary, type DressPromptFacets } from "./tryonPrompt.js";
import type { DressMediaCoverage } from "./dressCoverage.js";

/**
 * Generate one polished, gate-approved try-on look end to end (spec §5.2). The
 * route calls this after it has resolved the bride references and the dress
 * references; this composes the pieces validated live:
 *
 *   createTryonGenerator (Gemini chain) → generateLookWithQuality (engine with
 *   the garment-fidelity judge + adaptive retry) → polishGalleryFrame (branded
 *   finish) → the stored look.
 *
 * `generate` and `judge` default to the live implementations but are injectable
 * so the composition is unit-testable without a Gemini call.
 */

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

  const generate =
    params.generate ??
    createTryonGenerator({
      brideReferences: params.brideReferences,
      dressReferences: params.dressReferences,
    });

  const judge =
    params.judge ??
    (async (image: GeneratedLookImage): Promise<TryonQualityReport> => {
      const report = await assertTryonLookQuality({
        sessionId: params.sessionId,
        dressSummary: summary,
        generated: image,
        generatedModel: image.model,
        brideReferences: params.brideReferences,
        dressReferences: params.dressReferences,
      });
      // assertTryonLookQuality returns null only when the gate is disabled.
      return report ?? GATE_DISABLED_REPORT;
    });

  const result = await generateLookWithQuality({
    dress: params.dress,
    attempts: params.attempts,
    generate,
    judge,
  });

  const polished = await polishGalleryFrame(result.image.buffer, { sceneIndex: 0 });

  return {
    polished,
    mimeType: "image/jpeg",
    model: result.image.model,
    attempts: result.attempts,
    consultantReview: result.consultantReview,
    report: result.report,
  };
}

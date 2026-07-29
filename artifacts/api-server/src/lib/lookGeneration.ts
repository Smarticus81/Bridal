import { buildTryonPrompt, type DressPromptFacets } from "./tryonPrompt.js";
import {
  TryonQualityError,
  garmentRetryGuidanceForError,
  lookQualityScore,
  tryonAcceptanceFloorFailures,
  type TryonQualityReport,
} from "./tryonQuality.js";

/**
 * The per-look generation engine (spec §5.2, §5.4). Composes the prompt builder
 * and the garment-fidelity gate into an adaptive retry loop, the try-on analogue
 * of glimpse's `renderGalleryFrameWithQuality`:
 *
 *   1. Build the prompt (with retry guidance on later attempts).
 *   2. Generate an image (the injected `generate` owns model selection / fallback).
 *   3. Judge it against the garment-fidelity gate.
 *   4. On failure, keep the best-scoring attempt, feed the failure reasons into
 *      the next prompt, and retry up to `attempts` times.
 *   5. If no attempt hits the strict target, deliver the best attempt only if it
 *      clears the acceptance floor (→ consultant review, never straight to the
 *      bride); otherwise throw. Body-proportion and integrity are never waived.
 *
 * `generate` and `judge` are injected so the loop is testable without live
 * Gemini; the route supplies the real image client and `assertTryonLookQuality`.
 */

export interface GeneratedLookImage {
  buffer: Buffer;
  mimeType: string;
  model: string;
}

export interface LookGenerationResult {
  image: GeneratedLookImage;
  attempts: number;
  report: TryonQualityReport;
  /** True when the look passed on retry or was floor-delivered for consultant review. */
  escalated: boolean;
  /** True when delivered below the strict target (floor) — routes to the consultant. */
  consultantReview: boolean;
}

const MIN_ATTEMPTS = 1;
const MAX_ATTEMPTS = 6;
const DEFAULT_ATTEMPTS = 4;

function clampAttempts(n: number | undefined): number {
  const v = Number.isFinite(n) ? Math.trunc(n as number) : DEFAULT_ATTEMPTS;
  return Math.max(MIN_ATTEMPTS, Math.min(MAX_ATTEMPTS, v));
}

export async function generateLookWithQuality(params: {
  dress: DressPromptFacets;
  attempts?: number;
  /** Returns a generated image for the given prompt. Owns model selection + fallback. */
  generate: (prompt: string, attempt: number) => Promise<GeneratedLookImage>;
  /** Resolves with the quality report on pass; throws TryonQualityError on fail. */
  judge: (image: GeneratedLookImage) => Promise<TryonQualityReport>;
}): Promise<LookGenerationResult> {
  const maxAttempts = clampAttempts(params.attempts);
  let retryGuidance: string | undefined;
  let best: { image: GeneratedLookImage; report: TryonQualityReport; score: number } | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const prompt = buildTryonPrompt(params.dress, { retryGuidance });
    const image = await params.generate(prompt, attempt);
    try {
      const report = await params.judge(image);
      return { image, attempts: attempt, report, escalated: attempt > 1, consultantReview: false };
    } catch (err) {
      if (!(err instanceof TryonQualityError)) throw err;
      const score = lookQualityScore(err.report);
      if (!best || score > best.score) best = { image, report: err.report, score };
      retryGuidance = garmentRetryGuidanceForError(err) ?? retryGuidance;
    }
  }

  // Exhausted the strict target. Deliver the best attempt to the CONSULTANT only
  // if it clears the acceptance floor (integrity + body proportion never waived).
  if (best && tryonAcceptanceFloorFailures(best.report).length === 0) {
    return {
      image: best.image,
      attempts: maxAttempts,
      report: best.report,
      escalated: true,
      consultantReview: true,
    };
  }

  throw new TryonQualityError(
    "Look failed the garment-fidelity gate on every attempt.",
    best?.report ?? {
      brideLikenessScore: 0,
      garmentFidelityScore: 0,
      bodyProportionScore: 0,
      compositionScore: 0,
      exactlyOnePerson: false,
      faceVisible: false,
      extraPeople: false,
      textArtifacts: false,
      pass: false,
      reasons: ["no acceptable attempt"],
    },
    best ? { buffer: best.image.buffer, mimeType: best.image.mimeType } : { buffer: Buffer.alloc(0), mimeType: "image/jpeg" },
    best?.image.model ?? "unknown",
  );
}

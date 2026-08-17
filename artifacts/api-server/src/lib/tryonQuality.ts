import sharp from "sharp";
import { logger } from "./logger.js";
import {
  DRESS_MEDIA_COVERAGE_LABELS,
  isDressMediaCoverage,
  type DressMediaCoverage,
} from "./dressCoverage.js";

/**
 * The garment-fidelity quality gate — the bridal translation of glimpse's
 * gallery gate (`galleryQuality.ts`). The venue app placed a couple in an
 * environment that could drift unnoticed; a dress cannot. If beading shifts, an
 * illusion neckline becomes a sweetheart, or a lace repeat is invented, the
 * bride arrives expecting a dress that does not exist and the shop absorbs it.
 * Garment fidelity IS the product, so its threshold sits above venue's.
 *
 * Axis translation (spec §5.3):
 *   aggregate likeness      -> bride likeness            0.82
 *   per-partner likeness    -> (collapses, single subject)
 *   venue preservation      -> garment fidelity          0.88   (raised from 0.80)
 *   composition             -> composition               0.74
 *   distinct partner ident. -> body proportion pres.     0.85   (a score, non-negotiable)
 *   exactly-two-partners    -> exactly-one-person        integrity
 *   face visibility / extra people / text artifacts      integrity (unchanged)
 */

/** Renders on the look card, gallery, and every share view (spec §5.3, invariant 5). */
export const VISUALIZATION_DISCLAIMER =
  "Visualization only — not a representation of fit, size, or exact fabric.";

type ImageRef = { buffer: Buffer; mimeType: string; coverage?: DressMediaCoverage | null };

const GEMINI_API_BASE =
  process.env.GEMINI_API_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta";
const QUALITY_MODEL = process.env.GEMINI_QUALITY_MODEL ?? "gemini-2.5-pro";
const QUALITY_ENABLED = process.env.TRYON_QUALITY_GATE !== "off";

// Strict targets. Garment fidelity is deliberately above venue's 0.80: a generic
// ballroom disappoints; a wrong dress produces a returned order and a churned shop.
export const MIN_BRIDE_LIKENESS_SCORE = Number(process.env.TRYON_MIN_LIKENESS_SCORE ?? "0.82");
export const MIN_GARMENT_FIDELITY_SCORE = Number(process.env.TRYON_MIN_GARMENT_SCORE ?? "0.88");
export const MIN_COMPOSITION_SCORE = Number(process.env.TRYON_MIN_COMPOSITION_SCORE ?? "0.74");
export const MIN_BODY_PROPORTION_SCORE = Number(process.env.TRYON_MIN_BODY_PROPORTION_SCORE ?? "0.85");

// Acceptance floors: a look between floor and target goes to the CONSULTANT for
// review, never straight to the bride (§5.2 step 3). Integrity checks — and body
// proportion preservation — are never waived (invariant 4: no toggle, no exception).
export const FLOOR_BRIDE_LIKENESS_SCORE = Number(process.env.TRYON_FLOOR_LIKENESS_SCORE ?? "0.72");
export const FLOOR_GARMENT_FIDELITY_SCORE = Number(process.env.TRYON_FLOOR_GARMENT_SCORE ?? "0.78");
export const FLOOR_COMPOSITION_SCORE = Number(process.env.TRYON_FLOOR_COMPOSITION_SCORE ?? "0.6");

const MAX_TOTAL_JUDGE_IMAGES = 14;
const MAX_BRIDE_JUDGE_REFERENCES = 3;

interface GeminiQualityResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  error?: { message?: string; code?: number; status?: string };
}

export interface TryonQualityReport {
  brideLikenessScore: number;
  garmentFidelityScore: number;
  bodyProportionScore: number;
  compositionScore: number;
  exactlyOnePerson: boolean;
  faceVisible: boolean;
  extraPeople: boolean;
  textArtifacts: boolean;
  pass: boolean;
  reasons: string[];
}

export class TryonQualityError extends Error {
  constructor(
    message: string,
    public readonly report: TryonQualityReport,
    public readonly generated: { buffer: Buffer; mimeType: string },
    public readonly generatedModel: string,
  ) {
    super(message);
    this.name = "TryonQualityError";
  }
}

/**
 * Aggregate score used to rank below-target attempts so the best one can be kept.
 * Garment fidelity dominates: a look that gets the dress wrong is worse than one
 * that is slightly soft everywhere, because the wrong dress is what churns a shop.
 */
export function lookQualityScore(report: TryonQualityReport): number {
  return (
    report.garmentFidelityScore * 0.4 +
    report.brideLikenessScore * 0.25 +
    report.bodyProportionScore * 0.2 +
    report.compositionScore * 0.15
  );
}

/**
 * Hard requirements for delivering a look that missed the strict targets (to the
 * consultant, not the bride). Integrity checks AND body-proportion preservation
 * are never negotiable — a slimmed or lengthened bride orders a size that does
 * not fit and blames the store.
 */
export function tryonAcceptanceFloorFailures(report: TryonQualityReport): string[] {
  const failures: string[] = [];
  if (!report.exactlyOnePerson) failures.push("output does not contain exactly one person");
  if (!report.faceVisible) failures.push("face is not clearly visible");
  if (report.extraPeople) failures.push("extra people detected");
  if (report.textArtifacts) failures.push("text/logo artifacts detected");
  // Non-negotiable even for best-effort delivery (invariant 4).
  if (report.bodyProportionScore < MIN_BODY_PROPORTION_SCORE) {
    failures.push(
      `body proportion ${report.bodyProportionScore.toFixed(2)} < required ${MIN_BODY_PROPORTION_SCORE}`,
    );
  }
  if (report.brideLikenessScore < FLOOR_BRIDE_LIKENESS_SCORE) {
    failures.push(`bride likeness ${report.brideLikenessScore.toFixed(2)} < floor ${FLOOR_BRIDE_LIKENESS_SCORE}`);
  }
  if (report.garmentFidelityScore < FLOOR_GARMENT_FIDELITY_SCORE) {
    failures.push(`garment fidelity ${report.garmentFidelityScore.toFixed(2)} < floor ${FLOOR_GARMENT_FIDELITY_SCORE}`);
  }
  if (report.compositionScore < FLOOR_COMPOSITION_SCORE) {
    failures.push(`composition ${report.compositionScore.toFixed(2)} < floor ${FLOOR_COMPOSITION_SCORE}`);
  }
  return failures;
}

/** Strict-target failures, used to decide whether a look passes outright. */
export function tryonThresholdFailures(report: TryonQualityReport): string[] {
  const failures: string[] = [];
  if (report.brideLikenessScore < MIN_BRIDE_LIKENESS_SCORE) {
    failures.push(`bride likeness ${report.brideLikenessScore.toFixed(2)} < ${MIN_BRIDE_LIKENESS_SCORE}`);
  }
  if (report.garmentFidelityScore < MIN_GARMENT_FIDELITY_SCORE) {
    failures.push(`garment fidelity ${report.garmentFidelityScore.toFixed(2)} < ${MIN_GARMENT_FIDELITY_SCORE}`);
  }
  if (report.bodyProportionScore < MIN_BODY_PROPORTION_SCORE) {
    failures.push(`body proportion ${report.bodyProportionScore.toFixed(2)} < ${MIN_BODY_PROPORTION_SCORE}`);
  }
  if (report.compositionScore < MIN_COMPOSITION_SCORE) {
    failures.push(`composition ${report.compositionScore.toFixed(2)} < ${MIN_COMPOSITION_SCORE}`);
  }
  if (!report.exactlyOnePerson) failures.push("output does not contain exactly one person");
  if (!report.faceVisible) failures.push("face is not clearly visible");
  if (report.extraPeople) failures.push("extra people detected");
  if (report.textArtifacts) failures.push("text/logo artifacts detected");
  return failures;
}

/** Feeds quality-gate failure reasons into the next generation prompt (adaptive retry). */
export function garmentRetryGuidanceForError(err: unknown): string | null {
  if (!(err instanceof TryonQualityError)) return null;

  const r = err.report;
  const corrections: string[] = [];
  if (r.brideLikenessScore < MIN_BRIDE_LIKENESS_SCORE) {
    corrections.push(
      `bride likeness was weak (${r.brideLikenessScore.toFixed(2)}); match her exact face shape, eyes, nose, mouth, jaw, hair, skin tone, age, and build`,
    );
  }
  if (r.garmentFidelityScore < MIN_GARMENT_FIDELITY_SCORE) {
    corrections.push(
      `garment fidelity was weak (${r.garmentFidelityScore.toFixed(2)}); reproduce the exact dress from the references — silhouette, neckline, sleeves, beading and lace pattern and placement, fabric texture, train length, and color; do not invent, add, or omit garment details`,
    );
  }
  if (r.bodyProportionScore < MIN_BODY_PROPORTION_SCORE) {
    corrections.push(
      "preserve the bride's real body proportions exactly; do not slim, lengthen, or reshape her figure",
    );
  }
  if (!r.exactlyOnePerson) {
    corrections.push("show exactly one person — the bride — with no additional, duplicated, or merged people");
  }
  if (!r.faceVisible) {
    corrections.push("keep her face fully visible, sharp, unobstructed, and not cropped");
  }
  if (r.compositionScore < MIN_COMPOSITION_SCORE) {
    corrections.push("improve realistic scale, perspective, contact shadows, lighting direction, and lens depth");
  }
  if (r.extraPeople) corrections.push("remove all extra people");
  if (r.textArtifacts) corrections.push("remove text, logos, watermarks, and signage-like artifacts");
  corrections.push(...r.reasons.slice(0, 3));

  const unique = [...new Set(corrections.map((item) => item.trim()).filter(Boolean))];
  if (unique.length === 0) return null;

  return [
    "QUALITY RETRY CORRECTION: The previous generated look failed the production garment-fidelity gate.",
    "Generate a fresh image for the same dress while fixing these issues:",
    unique.map((item) => `- ${item}`).join("\n"),
    "Do not compensate by hiding the face, changing the bride, changing the dress, altering her body proportions, adding people, adding text, or making the image less photorealistic.",
  ].join("\n");
}

function dressCoverageLabel(coverage: unknown): string | null {
  return isDressMediaCoverage(coverage) ? DRESS_MEDIA_COVERAGE_LABELS[coverage] : null;
}

function numberInRange(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function parseJsonObject(text: string): Record<string, unknown> {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const raw = (fenced ?? text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error(`Quality judge returned no JSON object: ${text.slice(0, 240)}`);
  }
  return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
}

function extractText(json: GeminiQualityResponse): string {
  const parts = json.candidates?.[0]?.content?.parts ?? [];
  return parts.map((part) => part.text ?? "").join("\n").trim();
}

export function normalizeTryonReport(raw: Record<string, unknown>): TryonQualityReport {
  const reasonsRaw = Array.isArray(raw.reasons) ? raw.reasons : [];
  return {
    brideLikenessScore: numberInRange(raw.brideLikenessScore),
    garmentFidelityScore: numberInRange(raw.garmentFidelityScore),
    bodyProportionScore: numberInRange(raw.bodyProportionScore),
    compositionScore: numberInRange(raw.compositionScore),
    exactlyOnePerson: raw.exactlyOnePerson === true,
    faceVisible: raw.faceVisible === true,
    extraPeople: raw.extraPeople === true,
    textArtifacts: raw.textArtifacts === true,
    pass: raw.pass === true,
    reasons: reasonsRaw
      .filter((reason): reason is string => typeof reason === "string")
      .map((reason) => reason.slice(0, 180)),
  };
}

async function normalizeForJudge(image: ImageRef): Promise<Buffer> {
  return sharp(image.buffer)
    .rotate()
    .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
    .normalize({ lower: 1, upper: 99 })
    .sharpen({ sigma: 0.8 })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}

/**
 * The live garment-fidelity judge. Parallel to `assertGalleryFrameQuality`. Not
 * exercised by the local (no-live-run) verification path, but built and typed so
 * the pipeline and the QA harness can call it against live Gemini.
 */
export async function assertTryonLookQuality(params: {
  sessionId: number;
  dressSummary: string;
  generated: ImageRef;
  generatedModel?: string;
  brideReferences: ImageRef[];
  dressReferences: ImageRef[];
}): Promise<TryonQualityReport | null> {
  if (!QUALITY_ENABLED) return null;

  const apiKey = process.env.GOOGLE_AI_API_KEY ?? process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Gemini API key is required for garment-fidelity evaluation.");
  }

  const brideRefs = params.brideReferences.slice(0, MAX_BRIDE_JUDGE_REFERENCES);
  const maxDressRefs = Math.max(1, MAX_TOTAL_JUDGE_IMAGES - 1 - brideRefs.length);
  const dressRefs = params.dressReferences.slice(0, maxDressRefs);
  const generated = await normalizeForJudge(params.generated);
  const normalizedBrideRefs = await Promise.all(brideRefs.map((ref) => normalizeForJudge(ref)));
  const normalizedDressRefs = await Promise.all(dressRefs.map((ref) => normalizeForJudge(ref)));
  const dressCoverageSummary = dressRefs
    .map((ref, index) => {
      const label = dressCoverageLabel(ref.coverage);
      return label ? `DRESS REFERENCE ${index + 1}: ${label}` : null;
    })
    .filter((line): line is string => Boolean(line))
    .join("; ");

  const prompt = [
    "You are the final production garment-fidelity gate for a bridal try-on.",
    "Compare the GENERATED IMAGE to the BRIDE REFERENCES and DRESS REFERENCES.",
    "Score whether the generated image preserves the same one person's facial likeness and real body proportions, and whether it reproduces the exact same dress. Do not identify the person by name.",
    "Set exactlyOnePerson=true only when the output shows exactly one person — the bride from the references.",
    "brideLikenessScore: how exactly the generated face matches the real bride across her references.",
    "garmentFidelityScore: how exactly the dress matches the reference dress — silhouette, neckline, sleeves, beading and lace pattern and placement, fabric texture, train length, and color. Be conservative: if any garment detail is invented, added, omitted, or the neckline/silhouette changed, garmentFidelityScore must be below 0.88.",
    "bodyProportionScore: how faithfully the generated body proportions match the real bride. If she is slimmed, lengthened, or reshaped, bodyProportionScore must be below 0.85.",
    dressCoverageSummary
      ? `Dress reference coverage roles: ${dressCoverageSummary}. Use these roles to judge whether each garment feature matches the intended real dress.`
      : "",
    `Dress: ${params.dressSummary}.`,
    "Return only JSON with this exact shape:",
    '{"brideLikenessScore":0.0,"garmentFidelityScore":0.0,"bodyProportionScore":0.0,"compositionScore":0.0,"exactlyOnePerson":true,"faceVisible":true,"extraPeople":false,"textArtifacts":false,"pass":true,"reasons":["short reason"]}',
    "Set pass=false for the wrong person, a replaced or generic face, altered body proportions, an invented or altered dress, an obscured face, extra people, visible text, logos, watermarks, severe artifacts, or unrealistic compositing.",
  ].join("\n");

  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [
    { text: prompt },
    { text: "GENERATED IMAGE" },
    { inlineData: { mimeType: "image/jpeg", data: generated.toString("base64") } },
  ];

  normalizedBrideRefs.forEach((buffer, index) => {
    parts.push(
      { text: `BRIDE REFERENCE ${index + 1}` },
      { inlineData: { mimeType: "image/jpeg", data: buffer.toString("base64") } },
    );
  });

  normalizedDressRefs.forEach((buffer, index) => {
    const coverage = dressCoverageLabel(dressRefs[index]?.coverage);
    const label = `DRESS REFERENCE ${index + 1}${coverage ? `: ${coverage}` : ""}`;
    parts.push(
      { text: label },
      { inlineData: { mimeType: "image/jpeg", data: buffer.toString("base64") } },
    );
  });

  const body = {
    contents: [{ role: "user", parts }],
    generationConfig: { responseMimeType: "application/json", temperature: 0 },
  };

  const url = `${GEMINI_API_BASE}/models/${QUALITY_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Garment-fidelity judge failed (${res.status}): ${text.slice(0, 800)}`);
  }

  const json = JSON.parse(text) as GeminiQualityResponse;
  if (json.error) {
    throw new Error(`Garment-fidelity judge error: ${json.error.message ?? "unknown"}`);
  }

  const report = normalizeTryonReport(parseJsonObject(extractText(json)));
  const failures = tryonThresholdFailures(report);
  logger.info(
    {
      sessionId: params.sessionId,
      model: QUALITY_MODEL,
      report,
      thresholds: {
        likeness: MIN_BRIDE_LIKENESS_SCORE,
        garment: MIN_GARMENT_FIDELITY_SCORE,
        bodyProportion: MIN_BODY_PROPORTION_SCORE,
        composition: MIN_COMPOSITION_SCORE,
      },
    },
    "Try-on look quality evaluated",
  );

  if (!report.pass || failures.length > 0) {
    throw new TryonQualityError(
      `Generated look failed garment-fidelity gate: ${[...failures, ...report.reasons].join("; ")}`,
      report,
      { buffer: params.generated.buffer, mimeType: params.generated.mimeType },
      params.generatedModel ?? "unknown",
    );
  }

  return report;
}

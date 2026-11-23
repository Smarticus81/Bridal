import { DEFAULT_REVIEW_MODEL, finalReviewText } from "./geminiReview.js";
import sharp from "sharp";
import { z } from "zod";
import { evaluateBridePhoto } from "./photoGate.js";
import type { ReferenceImageQuality } from "./referenceImageQuality.js";

const observations = z.object({
  personCount: z.number().int().nonnegative(),
  fullBody: z.boolean(),
  armsAtSides: z.boolean(),
  containsMinor: z.boolean(),
  disallowedContent: z.boolean(),
});

/** Reject unsuitable source photos before spending an image-generation credit. */
export async function reviewBridePhoto(buffer: Buffer, quality: ReferenceImageQuality) {
  const key = process.env.GOOGLE_AI_API_KEY ?? process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Photo review is unavailable");
  const base = process.env.GEMINI_API_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta";
  const model = process.env.GEMINI_QUALITY_MODEL ?? DEFAULT_REVIEW_MODEL;
  const thumbnail = await sharp(buffer).rotate().resize({ width: 768, height: 1024, fit: "inside", withoutEnlargement: true }).jpeg().toBuffer();
  const response = await fetch(`${base}/models/${model}:generateContent`, {
    method: "POST",
    signal: AbortSignal.timeout(40_000),
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [
        { text: "Review framing and suitability for an adult bridal virtual try-on. Return JSON with personCount (integer), fullBody (face visible and body visible at least to knees), armsAtSides (torso visible), containsMinor (any apparent minor; when unsure about adulthood set true), disallowedContent (explicit content). Use booleans for all fields except personCount." },
        { inlineData: { mimeType: "image/jpeg", data: thumbnail.toString("base64") } },
      ] }],
      generationConfig: { responseMimeType: "application/json" },
    }),
  });
  if (!response.ok) throw new Error(`Photo review returned HTTP ${response.status}`);
  const data = z.object({
    promptFeedback: z.object({ blockReason: z.string().optional() }).optional(),
    candidates: z.array(z.object({ finishReason: z.string().optional(), content: z.object({
      parts: z.array(z.object({ text: z.string().optional(), thought: z.boolean().optional() })),
    }).optional() })).optional(),
  }).parse(await response.json());
  if (data.promptFeedback?.blockReason || data.candidates?.[0]?.finishReason === "SAFETY") {
    return { ok: false as const, reason: "Please use a clear, fully clothed photo of yourself as an adult." };
  }
  const analysis = observations.parse(JSON.parse(finalReviewText(data)));
  return evaluateBridePhoto({ ...analysis, brightness: quality.brightness, sharpness: quality.sharpness, minEdgePx: Math.min(quality.width, quality.height) });
}

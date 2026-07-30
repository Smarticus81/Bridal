import { configuredImageModels } from "./stillImageClient.js";
import { logger } from "./logger.js";
import type { GeneratedLookImage } from "./lookGeneration.js";

/**
 * The live try-on image generator (spec §5.1/§5.2) — the concrete `generate()`
 * the look-generation engine calls. Walks the configured Gemini image model
 * chain (gemini-3-pro-image → gemini-3.1-flash-image), sending the bride and
 * dress references plus the assembled prompt, and returns the raw generated
 * image. The production startup guard already refuses any chain not led by
 * gemini-3-pro-image, so this trusts `configuredImageModels()`.
 */

export interface ReferenceImage {
  buffer: Buffer;
  mimeType: string;
}

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

// Reference caps mirror the judge/generation limits: the bride is one subject
// (≤3 refs); the dress carries the garment detail (≤6 coverage views).
export const MAX_BRIDE_TRYON_REFERENCES = 3;
export const MAX_DRESS_TRYON_REFERENCES = 6;

/**
 * Assemble the Gemini `parts` payload: labeled bride references, labeled dress
 * references, then the prompt. Pure and capped, so it is unit-testable without
 * a live call.
 */
export function buildTryonImageParts(
  prompt: string,
  brideReferences: ReferenceImage[],
  dressReferences: ReferenceImage[],
): GeminiPart[] {
  const parts: GeminiPart[] = [{ text: "BRIDE REFERENCE IMAGES:" }];
  for (const ref of brideReferences.slice(0, MAX_BRIDE_TRYON_REFERENCES)) {
    parts.push({ inlineData: { mimeType: ref.mimeType, data: ref.buffer.toString("base64") } });
  }
  parts.push({ text: "DRESS REFERENCE IMAGES:" });
  for (const ref of dressReferences.slice(0, MAX_DRESS_TRYON_REFERENCES)) {
    parts.push({ inlineData: { mimeType: ref.mimeType, data: ref.buffer.toString("base64") } });
  }
  parts.push({ text: prompt });
  return parts;
}

const GEMINI_API_BASE =
  process.env.GEMINI_API_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta";

function imageSizeForModel(model: string): string | undefined {
  if (process.env.GEMINI_IMAGE_SIZE) return process.env.GEMINI_IMAGE_SIZE;
  return model.includes("2.5") ? undefined : "2K";
}

function isAvailabilityFailure(status: number, body: string): boolean {
  if (status === 404 || status === 429 || status >= 500) return true;
  if (status === 400) return /model|not found|not supported|unavailable|invalid model/i.test(body);
  return false;
}

interface GeminiImageResponse {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
  error?: { message?: string };
}

async function callImageModel(
  model: string,
  apiKey: string,
  parts: GeminiPart[],
): Promise<GeneratedLookImage> {
  const imageSize = imageSizeForModel(model);
  const body = {
    contents: [{ role: "user", parts }],
    generationConfig: {
      responseModalities: ["IMAGE"],
      ...(imageSize ? { imageConfig: { imageSize, aspectRatio: "3:4" } } : {}),
    },
  };
  const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`Try-on image model ${model} request failed (${res.status}): ${text.slice(0, 300)}`);
    (err as Error & { availability?: boolean }).availability = isAvailabilityFailure(res.status, text);
    throw err;
  }
  const json = JSON.parse(text) as GeminiImageResponse;
  if (json.error) throw new Error(`Try-on image model ${model} error: ${json.error.message ?? "unknown"}`);
  const part = (json.candidates?.[0]?.content?.parts ?? []).find((p) => p.inlineData?.data);
  if (!part?.inlineData) {
    throw new Error(
      `Try-on image model ${model} returned no image (finishReason=${json.candidates?.[0]?.finishReason ?? "none"}).`,
    );
  }
  return {
    buffer: Buffer.from(part.inlineData.data, "base64"),
    mimeType: part.inlineData.mimeType || "image/jpeg",
    model,
  };
}

/**
 * Build the engine's `generate(prompt)` function bound to this look's bride and
 * dress references. Walks the model chain, falling through to the next model
 * only on availability failures (404/429/5xx/model-not-found); other errors
 * abort immediately.
 */
export function createTryonGenerator(params: {
  brideReferences: ReferenceImage[];
  dressReferences: ReferenceImage[];
  apiKey?: string;
}): (prompt: string, attempt: number) => Promise<GeneratedLookImage> {
  const apiKey = params.apiKey ?? process.env.GOOGLE_AI_API_KEY ?? process.env.GEMINI_API_KEY;
  const models = configuredImageModels();

  return async (prompt: string, attempt: number): Promise<GeneratedLookImage> => {
    if (!apiKey) throw new Error("Gemini API key is required for try-on generation.");
    const parts = buildTryonImageParts(prompt, params.brideReferences, params.dressReferences);
    let lastError: Error | null = null;
    for (const model of models) {
      try {
        return await callImageModel(model, apiKey, parts);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const availability = (lastError as Error & { availability?: boolean }).availability;
        if (!availability) throw lastError;
        logger.warn({ model, attempt, err: lastError.message }, "Try-on image model unavailable; trying fallback");
      }
    }
    throw lastError ?? new Error("All try-on image models failed.");
  };
}

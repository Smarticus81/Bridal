export const DEFAULT_REVIEW_MODEL = "gemini-3.8-flash";

export interface GeminiReviewResponse {
  promptFeedback?: { blockReason?: string };
  candidates?: {
    finishReason?: string;
    content?: { parts?: { text?: string; thought?: boolean }[] };
  }[];
  error?: { message?: string; code?: number; status?: string };
}

/** A partial, blocked, or thought-only response cannot decide whether to publish a photograph. */
export function finalReviewText(response: GeminiReviewResponse): string {
  const candidate = response.candidates?.[0];
  if (response.promptFeedback?.blockReason || (candidate?.finishReason && candidate.finishReason !== "STOP")) {
    throw new Error("Image review did not finish");
  }
  const text = (candidate?.content?.parts ?? [])
    .filter(part => !part.thought)
    .map(part => part.text ?? "")
    .join("")
    .trim();
  if (!text) throw new Error("Image review returned no final result");
  return text;
}

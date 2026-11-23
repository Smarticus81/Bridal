/**
 * The remote-flow photo gate (spec §6.2). In store the consultant controls the
 * photo; at home the bride sends a cropped selfie, a group shot, or one with a
 * drink across her waist — and try-on collapses on all three, and she blames the
 * dress. This gate sits BEFORE generation: it turns a structured analysis of her
 * upload into either an accept or a rejection with a specific, plain reason she
 * can act on — never "invalid image".
 *
 * Two invariants live here:
 *  - The gate runs before any credit is debited (§6.2). Photo retries are free;
 *    a credit is charged only once a photo clears. Callers MUST evaluate here
 *    before charging — see `photoGatePrecedesBilling` for the documented order.
 *  - Moderation is mandatory on the remote flow (invariant 9): a hard block on
 *    any image involving a minor, and on disallowed content, before the image
 *    ever reaches Gemini.
 */

/** Minimum edge, matching the shared reference-image floor. */
export const BRIDE_PHOTO_MIN_EDGE_PX = 256;
const MIN_BRIGHTNESS = 30;
const MAX_BRIGHTNESS = 240;
const MIN_SHARPNESS = 6;

export interface BridePhotoAnalysis {
  minEdgePx: number;
  /** Mean luma, ~0–255. */
  brightness: number;
  /** Sharpness proxy (e.g. variance of Laplacian), higher is sharper. */
  sharpness: number;
  /** People detected by the moderation/vision pass. */
  personCount: number;
  /** Whether the subject is framed at least knees-up (full-body enough for try-on). */
  fullBody: boolean;
  /** Optional: arms away from the torso so the garment silhouette is unobstructed. */
  armsAtSides?: boolean;
  /** Moderation: any detected minor. Hard block, no override. */
  containsMinor: boolean;
  /** Moderation: disallowed (e.g. explicit) content. */
  disallowedContent?: boolean;
}

export type PhotoGateResult =
  | { ok: true }
  | { ok: false; code: PhotoGateRejectionCode; reason: string };

export type PhotoGateRejectionCode =
  | "minor_blocked"
  | "disallowed_content"
  | "no_person"
  | "multiple_people"
  | "too_small"
  | "too_dark"
  | "too_bright"
  | "blurry"
  | "not_full_body"
  | "arms_not_at_sides";

/**
 * Evaluate a bride photo. Ordered so the most blocking / most actionable reason
 * wins: safety blocks first, then "who's in frame", then image quality, then
 * framing pose. Reasons are written from the bride's side of the screen and
 * never apologize (spec §8 voice).
 */
export function evaluateBridePhoto(analysis: BridePhotoAnalysis): PhotoGateResult {
  // Safety first — mandatory moderation, no override (invariant 9, §6.2).
  if (analysis.containsMinor) {
    return {
      ok: false,
      code: "minor_blocked",
      reason: "This photo can't be used. Please upload a photo of yourself as an adult.",
    };
  }
  if (analysis.disallowedContent) {
    return {
      ok: false,
      code: "disallowed_content",
      reason: "This photo can't be used. Please upload a clear, full-body photo of yourself.",
    };
  }

  // Who's in frame.
  if (analysis.personCount <= 0) {
    return {
      ok: false,
      code: "no_person",
      reason: "We can't find you in this photo. Try again with your full body in frame.",
    };
  }
  if (analysis.personCount > 1) {
    return {
      ok: false,
      code: "multiple_people",
      reason: "There's more than one person in this photo. Try again with just you.",
    };
  }

  // Image quality.
  if (analysis.minEdgePx < BRIDE_PHOTO_MIN_EDGE_PX) {
    return {
      ok: false,
      code: "too_small",
      reason: "This photo is a little too small. Try again with a higher-resolution photo.",
    };
  }
  if (analysis.brightness < MIN_BRIGHTNESS) {
    return {
      ok: false,
      code: "too_dark",
      reason: "This photo is too dark. Try again near a window or in brighter light.",
    };
  }
  if (analysis.brightness > MAX_BRIGHTNESS) {
    return {
      ok: false,
      code: "too_bright",
      reason: "This photo is a little washed out. Try again with softer, even light.",
    };
  }
  if (analysis.sharpness < MIN_SHARPNESS) {
    return {
      ok: false,
      code: "blurry",
      reason: "This photo is a little blurry. Hold still and try again.",
    };
  }

  // Framing / pose.
  if (!analysis.fullBody) {
    return {
      ok: false,
      code: "not_full_body",
      reason: "We can't see below your knees. Step back so your whole dress will be in frame.",
    };
  }
  if (analysis.armsAtSides === false) {
    return {
      ok: false,
      code: "arms_not_at_sides",
      reason: "Your arms are crossed. Try again with them relaxed at your sides.",
    };
  }

  return { ok: true };
}

/**
 * Documents (and lets tests assert) the required ordering: the photo gate is
 * evaluated before billing, so a rejected photo never costs a credit. Returns
 * true only when the gate is evaluated strictly before the debit.
 */
export function photoGatePrecedesBilling(order: {
  gateEvaluatedAtStep: number;
  creditDebitedAtStep: number;
}): boolean {
  return order.gateEvaluatedAtStep < order.creditDebitedAtStep;
}

import {
  DRESS_MEDIA_COVERAGES,
  REQUIRED_DRESS_MEDIA_COVERAGE,
  type DressMediaCoverage,
} from "@workspace/db/schema";

/**
 * Dress reference coverage — the bridal analogue of venue coverage. Where a
 * venue needed five coverage slots present to generate a gallery, a dress needs
 * only its `front` view to be try-on ready; the other slots (`back`, `detail`,
 * `fabric`, `on_model`) sharpen garment fidelity but never block generation. A
 * bride arrives expecting the exact dress, so getting the garment right is the
 * product — hence `front` is required and detail/fabric are ranked high when
 * assembling the reference payload.
 */

export { DRESS_MEDIA_COVERAGES, REQUIRED_DRESS_MEDIA_COVERAGE };
export type { DressMediaCoverage };

export const DRESS_MEDIA_COVERAGE_LABELS: Record<DressMediaCoverage, string> = {
  front: "Front, full-length",
  back: "Back, full-length",
  detail: "Beading / lace / neckline detail",
  fabric: "Fabric / texture close-up",
  on_model: "On-model reference",
};

export function isDressMediaCoverage(value: unknown): value is DressMediaCoverage {
  return (
    typeof value === "string" &&
    (DRESS_MEDIA_COVERAGES as readonly string[]).includes(value)
  );
}

export interface DressCoverageStatus {
  /** Try-on ready: the required `front` coverage is present. */
  tryOnReady: boolean;
  present: DressMediaCoverage[];
  missing: DressMediaCoverage[];
  /** The specific gap that blocks try-on, if any (only `front` blocks). */
  blockingGap: DressMediaCoverage | null;
}

/**
 * Readiness for a dress given its media. `tryOnReady` gates generation exactly
 * as venue coverage gated the gallery — but here the bar is a single validated
 * `front` image, not full coverage. `missing` still lists every absent slot so
 * the console can nudge the shop toward richer references.
 */
export function dressCoverageStatus(
  media: Array<{ coverage?: string | null }>,
): DressCoverageStatus {
  const present = new Set<DressMediaCoverage>();
  for (const item of media) {
    if (isDressMediaCoverage(item.coverage)) present.add(item.coverage);
  }
  const missing = DRESS_MEDIA_COVERAGES.filter((coverage) => !present.has(coverage));
  const tryOnReady = present.has(REQUIRED_DRESS_MEDIA_COVERAGE);
  return {
    tryOnReady,
    present: DRESS_MEDIA_COVERAGES.filter((coverage) => present.has(coverage)),
    missing,
    blockingGap: tryOnReady ? null : REQUIRED_DRESS_MEDIA_COVERAGE,
  };
}

/**
 * Priority order for packing a dress's reference photos into the generation
 * payload. Front leads (identity of the garment), then the garment-fidelity
 * detail views, then supporting shots. Deterministic so a look is reproducible.
 */
export const DRESS_REFERENCE_PRIORITY: readonly DressMediaCoverage[] = [
  "front",
  "detail",
  "fabric",
  "back",
  "on_model",
] as const;

/**
 * Order a dress's media for the reference payload: required front first, then by
 * garment-fidelity priority, then any unknown-coverage rows last (stable within
 * each bucket so display_order from the caller is preserved).
 */
export function orderDressMediaForGeneration<T extends { coverage?: string | null }>(
  media: T[],
): T[] {
  const rank = (coverage: string | null | undefined): number => {
    if (!isDressMediaCoverage(coverage)) return DRESS_REFERENCE_PRIORITY.length;
    return DRESS_REFERENCE_PRIORITY.indexOf(coverage);
  };
  return media
    .map((item, index) => ({ item, index }))
    .sort((a, b) => rank(a.item.coverage) - rank(b.item.coverage) || a.index - b.index)
    .map(({ item }) => item);
}

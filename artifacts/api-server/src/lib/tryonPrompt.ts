/**
 * Try-on prompt assembly (spec §5.4, priority 1: garment-detail emphasis with
 * explicit neckline/silhouette naming from the dress metadata). Analogous to
 * glimpse's scene prompt builder, but for placing one bride in one exact dress.
 *
 * Three locks, mirroring the quality gate's axes so the generator and judge
 * agree on what matters:
 *   IDENTITY  — preserve the bride's face and, non-negotiably, her body proportions.
 *   GARMENT   — reproduce the exact dress; name every known facet so nothing is invented.
 *   COMPOSITE — exactly one person, plain studio, photorealistic, no text.
 */

export interface DressPromptFacets {
  styleName: string;
  designer?: string | null;
  silhouette?: string | null;
  neckline?: string | null;
  sleeve?: string | null;
  trainLength?: string | null;
  fabric?: string | null;
  color?: string | null;
}

/** Hard cap so the prompt stays within model limits even with long retry guidance. */
export const MAX_TRYON_PROMPT_CHARS = 1800;

/** A short human/gate-facing description, e.g. "Aurora by Rue de Seine — A-line, sweetheart neckline, lace". */
export function dressSummary(d: DressPromptFacets): string {
  const facets = [
    d.silhouette && `${d.silhouette} silhouette`,
    d.neckline && `${d.neckline} neckline`,
    d.sleeve,
    d.trainLength && `${d.trainLength} train`,
    d.fabric,
    d.color,
  ].filter((f): f is string => Boolean(f && f.trim()));
  const head = d.designer ? `${d.styleName} by ${d.designer}` : d.styleName;
  return facets.length ? `${head} — ${facets.join(", ")}` : head;
}

/** The explicit "reproduce exactly" garment clause, naming only the facets we know. */
function garmentFacetClause(d: DressPromptFacets): string {
  const named: string[] = [];
  if (d.silhouette) named.push(`the ${d.silhouette} silhouette`);
  if (d.neckline) named.push(`the exact ${d.neckline} neckline`);
  if (d.sleeve) named.push(`the ${d.sleeve} sleeves`);
  if (d.trainLength) named.push(`the ${d.trainLength} train`);
  if (d.fabric) named.push(`the ${d.fabric} fabric and its texture`);
  if (d.color) named.push(`the ${d.color} color`);
  named.push("all beading, lace pattern and placement, and every garment detail");
  return `Reproduce the exact dress from the dress reference images: ${named.join(", ")}. Do not invent, add, omit, or alter any garment detail.`;
}

/**
 * Build the try-on generation prompt for one bride wearing one dress. `retryGuidance`
 * (from `garmentRetryGuidanceForError`) is appended for adaptive retries. The
 * result is clamped to `MAX_TRYON_PROMPT_CHARS`.
 */
export function buildTryonPrompt(d: DressPromptFacets, opts: { retryGuidance?: string } = {}): string {
  const lines = [
    `TRY-ON: Generate a photorealistic full-length image of the bride from the bride reference images wearing ${dressSummary(d)}.`,
    "IDENTITY LOCK: Preserve her exact face, hair, skin tone, and age. Preserve her real body proportions exactly — do not slim, lengthen, or reshape her figure.",
    `GARMENT LOCK: ${garmentFacetClause(d)}`,
    "COMPOSITING LOCK: Exactly one person — the bride. Plain, evenly lit studio backdrop. Natural scale, perspective, and contact shadows. No additional or duplicated people. No text, logos, or watermarks. Photorealistic.",
  ];
  const guidance = opts.retryGuidance?.trim();
  if (guidance) lines.push(guidance);
  const prompt = lines.join("\n");
  return prompt.length > MAX_TRYON_PROMPT_CHARS ? prompt.slice(0, MAX_TRYON_PROMPT_CHARS) : prompt;
}

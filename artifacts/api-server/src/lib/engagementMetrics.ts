/**
 * Share-to-party vote tallying and the commercial funnel (spec §6.4-6.5).
 *
 * Reactions are one-per-viewer-per-look (enforced by the `reactions` unique
 * index on `(generated_asset_id, voter_token)`); these pure helpers turn raw
 * reaction rows into the live tally the bride sees, decide when to surface
 * "Book a fitting", and summarize the acquisition funnel a shop watches.
 */

/** A look crosses into "Book a fitting" territory once it has this many votes. */
export const BOOK_FITTING_VOTE_THRESHOLD = 3;

export interface ReactionRow {
  generatedAssetId: number;
  voterToken: string;
  kind: string;
}

export interface LookTally {
  generatedAssetId: number;
  total: number;
  byKind: Record<string, number>;
}

/**
 * Collapse raw reaction rows to one per (look, viewer), last write winning — a
 * viewer who changes their reaction is counted once, at their latest choice.
 * Rows are assumed in chronological order; the last occurrence per key wins.
 */
export function dedupeReactionsByVoter(reactions: ReactionRow[]): ReactionRow[] {
  const latest = new Map<string, ReactionRow>();
  for (const r of reactions) {
    latest.set(`${r.generatedAssetId}::${r.voterToken}`, r);
  }
  return [...latest.values()];
}

/** Per-look vote tally (deduped by viewer), the live number the bride watches. */
export function tallyLookVotes(reactions: ReactionRow[]): LookTally[] {
  const deduped = dedupeReactionsByVoter(reactions);
  const byAsset = new Map<number, LookTally>();
  for (const r of deduped) {
    let tally = byAsset.get(r.generatedAssetId);
    if (!tally) {
      tally = { generatedAssetId: r.generatedAssetId, total: 0, byKind: {} };
      byAsset.set(r.generatedAssetId, tally);
    }
    tally.total += 1;
    tally.byKind[r.kind] = (tally.byKind[r.kind] ?? 0) + 1;
  }
  return [...byAsset.values()].sort((a, b) => b.total - a.total || a.generatedAssetId - b.generatedAssetId);
}

/** Whether a look has crossed the fitting-booking threshold. */
export function shouldSurfaceBookFitting(voteTotal: number): boolean {
  return voteTotal >= BOOK_FITTING_VOTE_THRESHOLD;
}

/** The most-loved look, or null if there are no votes. Ties break to the lower id. */
export function topLookByVotes(reactions: ReactionRow[]): number | null {
  const tally = tallyLookVotes(reactions);
  return tally.length > 0 ? tally[0]!.generatedAssetId : null;
}

export interface FunnelCounts {
  linkOpens: number;
  photosCleared: number;
  looksGenerated: number;
  shares: number;
  votes: number;
  fittingsBooked: number;
}

export interface FunnelRates {
  photoClearRate: number; // photosCleared / linkOpens
  generateRate: number; // looksGenerated / photosCleared
  shareRate: number; // shares / looksGenerated
  voteRate: number; // votes / shares
  bookingRate: number; // fittingsBooked / looksGenerated
}

/** Stage-to-stage conversion, guarding divide-by-zero (0 when the prior stage is empty). */
export function funnelConversion(counts: FunnelCounts): FunnelRates {
  const ratio = (num: number, den: number): number => (den > 0 ? num / den : 0);
  return {
    photoClearRate: ratio(counts.photosCleared, counts.linkOpens),
    generateRate: ratio(counts.looksGenerated, counts.photosCleared),
    shareRate: ratio(counts.shares, counts.looksGenerated),
    voteRate: ratio(counts.votes, counts.shares),
    bookingRate: ratio(counts.fittingsBooked, counts.looksGenerated),
  };
}

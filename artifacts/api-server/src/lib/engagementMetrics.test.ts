import assert from "node:assert/strict";
import test from "node:test";
import {
  BOOK_FITTING_VOTE_THRESHOLD,
  dedupeReactionsByVoter,
  funnelConversion,
  shouldSurfaceBookFitting,
  tallyLookVotes,
  topLookByVotes,
  type ReactionRow,
} from "./engagementMetrics.js";

const rows: ReactionRow[] = [
  { generatedAssetId: 10, voterToken: "a", kind: "love" },
  { generatedAssetId: 10, voterToken: "b", kind: "love" },
  { generatedAssetId: 10, voterToken: "c", kind: "maybe" },
  { generatedAssetId: 20, voterToken: "a", kind: "love" },
];

test("one vote per viewer per look — a viewer's latest reaction wins", () => {
  const changed: ReactionRow[] = [
    { generatedAssetId: 10, voterToken: "a", kind: "love" },
    { generatedAssetId: 10, voterToken: "a", kind: "pass" }, // same viewer changes mind
  ];
  const deduped = dedupeReactionsByVoter(changed);
  assert.equal(deduped.length, 1);
  assert.equal(deduped[0]!.kind, "pass");
});

test("tally counts deduped votes per look and by kind, sorted by total", () => {
  const tally = tallyLookVotes(rows);
  assert.equal(tally[0]!.generatedAssetId, 10);
  assert.equal(tally[0]!.total, 3);
  assert.deepEqual(tally[0]!.byKind, { love: 2, maybe: 1 });
  assert.equal(tally[1]!.generatedAssetId, 20);
  assert.equal(tally[1]!.total, 1);
});

test("book-a-fitting surfaces only at or above the 3-vote threshold", () => {
  assert.equal(BOOK_FITTING_VOTE_THRESHOLD, 3);
  assert.equal(shouldSurfaceBookFitting(2), false);
  assert.equal(shouldSurfaceBookFitting(3), true);
  assert.equal(shouldSurfaceBookFitting(9), true);
});

test("top look is the most-voted; null when there are no votes", () => {
  assert.equal(topLookByVotes(rows), 10);
  assert.equal(topLookByVotes([]), null);
});

test("tie on votes breaks to the lower asset id", () => {
  const tie: ReactionRow[] = [
    { generatedAssetId: 30, voterToken: "a", kind: "love" },
    { generatedAssetId: 5, voterToken: "b", kind: "love" },
  ];
  assert.equal(topLookByVotes(tie), 5);
});

test("funnel conversion guards divide-by-zero", () => {
  const rates = funnelConversion({
    linkOpens: 100,
    photosCleared: 80,
    looksGenerated: 60,
    shares: 30,
    votes: 90,
    fittingsBooked: 6,
  });
  assert.equal(rates.photoClearRate, 0.8);
  assert.equal(rates.generateRate, 0.75);
  assert.equal(rates.bookingRate, 0.1);

  const empty = funnelConversion({
    linkOpens: 0,
    photosCleared: 0,
    looksGenerated: 0,
    shares: 0,
    votes: 0,
    fittingsBooked: 0,
  });
  assert.equal(empty.photoClearRate, 0);
  assert.equal(empty.voteRate, 0);
});

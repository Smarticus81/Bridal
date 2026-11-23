import assert from "node:assert/strict";
import test from "node:test";
import { finalReviewText } from "./geminiReview.js";

const parts = [
  { text: '{"pass":true}', thought: true },
  { text: '{"pass":' },
  { text: 'false}' },
];

test("reads only the final structured assessment across response parts", () => {
  const text = finalReviewText({ candidates: [{ finishReason: "STOP", content: { parts } }] });
  assert.deepEqual(JSON.parse(text), { pass: false });
});

test("rejects blocked, truncated and thought-only reviews even when they contain valid JSON", () => {
  for (const finishReason of ["MAX_TOKENS", "SAFETY", "OTHER"]) {
    assert.throws(() => finalReviewText({ candidates: [{ finishReason, content: { parts } }] }));
  }
  assert.throws(() => finalReviewText({ promptFeedback: { blockReason: "SAFETY" }, candidates: [{ content: { parts } }] }));
  assert.throws(() => finalReviewText({ candidates: [{ content: { parts: [parts[0]!] } }] }));
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_TRYON_PROMPT_CHARS,
  buildTryonPrompt,
  dressSummary,
  type DressPromptFacets,
} from "./tryonPrompt.js";

const full: DressPromptFacets = {
  styleName: "Aurora",
  designer: "Rue de Seine",
  silhouette: "A-line",
  neckline: "sweetheart",
  sleeve: "sleeveless",
  trainLength: "cathedral",
  fabric: "chantilly lace",
  color: "ivory",
};

test("dressSummary names the style, designer, and known facets", () => {
  const s = dressSummary(full);
  assert.match(s, /Aurora by Rue de Seine/);
  assert.match(s, /A-line silhouette/);
  assert.match(s, /sweetheart neckline/);
  assert.match(s, /cathedral train/);
});

test("summary degrades gracefully with only a style name", () => {
  assert.equal(dressSummary({ styleName: "Wren" }), "Wren");
});

test("prompt names every known garment facet explicitly (§5.4 priority 1)", () => {
  const p = buildTryonPrompt(full);
  for (const facet of ["A-line", "sweetheart", "sleeveless", "cathedral", "chantilly lace", "ivory"]) {
    assert.ok(p.includes(facet), `prompt names ${facet}`);
  }
  assert.match(p, /beading, lace pattern and placement/);
  assert.match(p, /Do not invent, add, omit, or alter any garment detail/);
});

test("prompt hard-locks identity and body proportions (invariant 4)", () => {
  const p = buildTryonPrompt(full);
  assert.match(p, /Preserve her real body proportions exactly/);
  assert.match(p, /do not slim, lengthen, or reshape/);
  assert.match(p, /Exactly one person/);
});

test("unknown facets are omitted, never emitted as null/undefined", () => {
  const p = buildTryonPrompt({ styleName: "Wren", neckline: "V-neck" });
  assert.ok(!/null|undefined/.test(p));
  assert.match(p, /V-neck neckline/);
  assert.ok(!p.includes("silhouette,")); // no dangling empty facet
});

test("retry guidance is appended when provided", () => {
  const p = buildTryonPrompt(full, { retryGuidance: "QUALITY RETRY CORRECTION: fix the neckline." });
  assert.match(p, /QUALITY RETRY CORRECTION: fix the neckline\./);
});

test("prompt is clamped to the max length even with long retry guidance", () => {
  const p = buildTryonPrompt(full, { retryGuidance: "x".repeat(5000) });
  assert.ok(p.length <= MAX_TRYON_PROMPT_CHARS);
});

import assert from "node:assert/strict";
import test from "node:test";
import { isWellFormedLookbookToken, mintLookbookToken } from "./lookbookToken.js";

test("minted tokens are URL-safe, long enough, and unique", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 200; i += 1) {
    const token = mintLookbookToken();
    assert.ok(isWellFormedLookbookToken(token), `well-formed: ${token}`);
    assert.ok(token.length >= 16);
    assert.ok(!seen.has(token), "unique");
    seen.add(token);
  }
});

test("well-formedness rejects short or non-url-safe tokens", () => {
  assert.equal(isWellFormedLookbookToken("short"), false);
  assert.equal(isWellFormedLookbookToken("has spaces and slashes/=="), false);
  assert.equal(isWellFormedLookbookToken("A".repeat(16)), true);
});

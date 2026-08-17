import assert from "node:assert/strict";
import test from "node:test";
import { filterDresses, matchesDressFilters, type FilterableDress } from "./dressFilters.js";

const base: FilterableDress = {
  silhouette: "A-line",
  neckline: "Sweetheart",
  sleeve: "Sleeveless",
  sizeRange: "2-16",
  priceCents: 150000,
  shopIds: [1, 2],
  status: "in_stock",
  tryOnReady: true,
};

test("no filters matches everything", () => {
  assert.equal(matchesDressFilters(base, {}), true);
});

test("silhouette/neckline/sleeve match case-insensitively and exactly", () => {
  assert.equal(matchesDressFilters(base, { silhouette: "a-line" }), true);
  assert.equal(matchesDressFilters(base, { silhouette: "ballgown" }), false);
  assert.equal(matchesDressFilters(base, { neckline: "SWEETHEART" }), true);
  assert.equal(matchesDressFilters(base, { sleeve: "long" }), false);
});

test("size range is a substring match", () => {
  assert.equal(matchesDressFilters(base, { sizeRange: "16" }), true);
  assert.equal(matchesDressFilters(base, { sizeRange: "20" }), false);
});

test("price band is inclusive and excludes price-less dresses", () => {
  assert.equal(matchesDressFilters(base, { minPriceCents: 100000, maxPriceCents: 200000 }), true);
  assert.equal(matchesDressFilters(base, { minPriceCents: 160000 }), false);
  assert.equal(matchesDressFilters(base, { maxPriceCents: 140000 }), false);
  assert.equal(matchesDressFilters({ ...base, priceCents: null }, { minPriceCents: 1 }), false);
});

test("in-stock-at-this-shop checks shopIds membership", () => {
  assert.equal(matchesDressFilters(base, { shopId: 2 }), true);
  assert.equal(matchesDressFilters(base, { shopId: 9 }), false);
});

test("try-on-ready-only excludes dresses without a front image", () => {
  assert.equal(matchesDressFilters(base, { tryOnReadyOnly: true }), true);
  assert.equal(matchesDressFilters({ ...base, tryOnReady: false }, { tryOnReadyOnly: true }), false);
  // tryOnReadyOnly false/absent does not exclude
  assert.equal(matchesDressFilters({ ...base, tryOnReady: false }, {}), true);
});

test("combined filters must all pass; filterDresses preserves order", () => {
  const catalog: FilterableDress[] = [
    { ...base, silhouette: "A-line", priceCents: 120000 },
    { ...base, silhouette: "Ballgown", priceCents: 120000 },
    { ...base, silhouette: "A-line", priceCents: 500000 },
  ];
  const out = filterDresses(catalog, { silhouette: "a-line", maxPriceCents: 200000 });
  assert.equal(out.length, 1);
  assert.equal(out[0]!.priceCents, 120000);
});

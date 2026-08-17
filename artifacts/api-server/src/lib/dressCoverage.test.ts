import assert from "node:assert/strict";
import test from "node:test";
import {
  dressCoverageStatus,
  isDressMediaCoverage,
  orderDressMediaForGeneration,
} from "./dressCoverage.js";

test("recognizes the five dress coverage slots and nothing else", () => {
  for (const c of ["front", "back", "detail", "fabric", "on_model"]) {
    assert.equal(isDressMediaCoverage(c), true);
  }
  assert.equal(isDressMediaCoverage("exterior"), false);
  assert.equal(isDressMediaCoverage(null), false);
  assert.equal(isDressMediaCoverage(undefined), false);
});

test("a dress is try-on ready as soon as it has a front image", () => {
  const status = dressCoverageStatus([{ coverage: "front" }]);
  assert.equal(status.tryOnReady, true);
  assert.equal(status.blockingGap, null);
  assert.deepEqual(status.present, ["front"]);
  // Still reports the richer slots it lacks, for the console nudge.
  assert.deepEqual(status.missing, ["back", "detail", "fabric", "on_model"]);
});

test("detail/fabric/back without a front is NOT try-on ready and names the gap", () => {
  const status = dressCoverageStatus([{ coverage: "detail" }, { coverage: "fabric" }]);
  assert.equal(status.tryOnReady, false);
  assert.equal(status.blockingGap, "front");
  assert.ok(status.missing.includes("front"));
});

test("empty media is not ready", () => {
  const status = dressCoverageStatus([]);
  assert.equal(status.tryOnReady, false);
  assert.equal(status.blockingGap, "front");
});

test("reference ordering puts front first, then garment-fidelity detail, then the rest", () => {
  const media = [
    { coverage: "on_model", id: 1 },
    { coverage: "back", id: 2 },
    { coverage: "front", id: 3 },
    { coverage: "fabric", id: 4 },
    { coverage: "detail", id: 5 },
  ];
  assert.deepEqual(
    orderDressMediaForGeneration(media).map((m) => m.coverage),
    ["front", "detail", "fabric", "back", "on_model"],
  );
});

test("ordering is stable and pushes unknown-coverage rows last", () => {
  const media = [
    { coverage: "mystery", id: 1 },
    { coverage: "front", id: 2 },
    { coverage: null, id: 3 },
    { coverage: "front", id: 4 },
  ];
  // Both fronts lead in original order; unknown/null rows trail in original order.
  assert.deepEqual(
    orderDressMediaForGeneration(media).map((m) => m.id),
    [2, 4, 1, 3],
  );
});

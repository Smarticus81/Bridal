import assert from "node:assert/strict";
import test from "node:test";
import {
  diffInventory,
  mapRowsToDresses,
  parseCsv,
  parsePriceToCents,
  resolveColumnMapping,
  summarizeDiff,
  type ExistingDress,
} from "./inventoryImport.js";

test("parseCsv handles quotes, escaped quotes, commas and newlines in fields", () => {
  const text =
    'sku,style,price\n' +
    'A-1,"Aria, ivory",1299\n' +
    'B-2,"She said ""yes""",\r\n';
  const parsed = parseCsv(text);
  assert.deepEqual(parsed.headers, ["sku", "style", "price"]);
  assert.equal(parsed.rows.length, 2);
  assert.deepEqual(parsed.rows[0], ["A-1", "Aria, ivory", "1299"]);
  assert.deepEqual(parsed.rows[1], ["B-2", 'She said "yes"', ""]);
});

test("column mapping resolves by alias and by explicit override", () => {
  const cols = resolveColumnMapping(["SKU", "Style Name", "Brand", "MSRP"], { MSRP: "priceCents" });
  assert.equal(cols.get(0), "sku");
  assert.equal(cols.get(1), "styleName");
  assert.equal(cols.get(2), "designer");
  assert.equal(cols.get(3), "priceCents");
});

test("price parsing handles $, commas, and decimals", () => {
  assert.equal(parsePriceToCents("$1,299.00"), 129900);
  assert.equal(parsePriceToCents("1299"), 129900);
  assert.equal(parsePriceToCents("129900.5"), 12990050);
  assert.equal(parsePriceToCents(null), null);
  assert.equal(parsePriceToCents("—"), null);
});

test("rows missing sku or style are invalid; bad status is invalid", () => {
  const parsed = parseCsv(
    "sku,style,status\n" +
      "A-1,Aria,in stock\n" + // normalizes "in stock" -> in_stock
      ",NoSku,in_stock\n" +
      "C-3,,in_stock\n" +
      "D-4,Dana,teleported\n",
  );
  const { valid, invalid } = mapRowsToDresses(parsed);
  assert.equal(valid.length, 1);
  assert.equal(valid[0]!.sku, "A-1");
  assert.equal(valid[0]!.status, "in_stock");
  assert.equal(invalid.length, 3);
  assert.ok(invalid[0]!.errors.includes("missing sku"));
  assert.ok(invalid[1]!.errors.includes("missing styleName"));
  assert.ok(invalid[2]!.errors.some((e) => e.includes("invalid status")));
});

test("status defaults to in_stock when absent", () => {
  const { valid } = mapRowsToDresses(parseCsv("sku,style\nA-1,Aria\n"));
  assert.equal(valid[0]!.status, "in_stock");
});

test("diff classifies create / update / unchanged and archives missing", () => {
  const parsed = parseCsv(
    "sku,style,price,status\n" +
      "KEEP-1,Aria,1299,in_stock\n" + // unchanged
      "UPD-1,Bianca renamed,1500,in_stock\n" + // update (style + price)
      "NEW-1,Cara,999,in_stock\n", // create
  );
  const mapped = mapRowsToDresses(parsed);
  const existing: ExistingDress[] = [
    { id: 1, sku: "KEEP-1", styleName: "Aria", priceCents: 129900, status: "in_stock" },
    { id: 2, sku: "UPD-1", styleName: "Bianca", priceCents: 130000, status: "in_stock" },
    { id: 3, sku: "GONE-1", styleName: "Old", priceCents: 100000, status: "in_stock" },
  ];
  const diff = diffInventory(mapped, existing, { archiveMissing: true });
  assert.deepEqual(diff.create.map((d) => d.sku), ["NEW-1"]);
  assert.deepEqual(diff.update.map((u) => u.sku), ["UPD-1"]);
  assert.ok(diff.update[0]!.changes.includes("styleName"));
  assert.ok(diff.update[0]!.changes.includes("priceCents"));
  assert.deepEqual(diff.unchanged, ["KEEP-1"]);
  assert.deepEqual(diff.archive.map((d) => d.sku), ["GONE-1"]);
});

test("archiveMissing off leaves absent dresses alone", () => {
  const mapped = mapRowsToDresses(parseCsv("sku,style\nNEW-1,Cara\n"));
  const existing: ExistingDress[] = [
    { id: 3, sku: "GONE-1", styleName: "Old", status: "in_stock" },
  ];
  const diff = diffInventory(mapped, existing, { archiveMissing: false });
  assert.equal(diff.archive.length, 0);
});

test("summary reads 'will create N, update M, archive K'", () => {
  const mapped = mapRowsToDresses(
    parseCsv("sku,style\nNEW-1,Cara\n,BadNoSku\n"),
  );
  const diff = diffInventory(mapped, [], { archiveMissing: true });
  const summary = summarizeDiff(diff);
  assert.match(summary, /will create 1, update 0, archive 0/);
  assert.match(summary, /1 invalid \(skipped\)/);
});

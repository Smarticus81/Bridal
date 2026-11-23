import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_BRIDE_TRYON_REFERENCES,
  MAX_DRESS_TRYON_REFERENCES,
  buildTryonImageParts,
  type ReferenceImage,
} from "./tryonImageClient.js";

const ref = (label: string): ReferenceImage => ({ buffer: Buffer.from(label), mimeType: "image/jpeg" });

test("payload labels bride refs, then dress refs, then the prompt", () => {
  const parts = buildTryonImageParts("PROMPT", [ref("b1")], [ref("d1")]);
  assert.equal(parts[0]!.text, "BRIDE REFERENCE IMAGES:");
  assert.equal(parts[1]!.inlineData?.data, Buffer.from("b1").toString("base64"));
  assert.equal(parts[2]!.text, "DRESS REFERENCE IMAGES:");
  assert.equal(parts[3]!.inlineData?.data, Buffer.from("d1").toString("base64"));
  assert.equal(parts[parts.length - 1]!.text, "PROMPT");
});

test("bride and dress references are capped", () => {
  const brides = Array.from({ length: 8 }, (_, i) => ref(`b${i}`));
  const dresses = Array.from({ length: 12 }, (_, i) => ref(`d${i}`));
  const parts = buildTryonImageParts("P", brides, dresses);
  const images = parts.filter((p) => p.inlineData);
  assert.equal(images.length, MAX_BRIDE_TRYON_REFERENCES + MAX_DRESS_TRYON_REFERENCES);
});

test("inline data is base64 with the ref's mime type", () => {
  const parts = buildTryonImageParts("P", [{ buffer: Buffer.from([1, 2, 3]), mimeType: "image/png" }], []);
  const img = parts.find((p) => p.inlineData);
  assert.equal(img?.inlineData?.mimeType, "image/png");
  assert.equal(img?.inlineData?.data, Buffer.from([1, 2, 3]).toString("base64"));
});

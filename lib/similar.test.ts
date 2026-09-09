import assert from "node:assert/strict";
import test from "node:test";
import { dHashFromGrayscale, getSimilarPhotoGroups, hammingDistance, rgbaToGrayscale, SIMILARITY_HASH_THRESHOLD } from "./similar.ts";

const hashWithBits = (count: number) => ((1n << BigInt(count)) - 1n).toString(16).padStart(16, "0");
const photo = (fileName: string, hash: string, minute = 0, width = 4000, height = 3000) => ({
  fileName, perceptualHash: hash, takenAt: new Date(Date.UTC(2024, 0, 1, 12, minute)), width, height,
});

test("dHash uses grayscale luminance and always contains 64 bits", () => {
  const rgba = new Uint8Array(9 * 8 * 4);
  for (let i = 0; i < 9 * 8; i += 1) rgba.set([i, i, i, 255], i * 4);
  const hash = dHashFromGrayscale(rgbaToGrayscale(rgba));
  assert.match(hash, /^[0-9a-f]{16}$/);
  assert.equal(hash, "ffffffffffffffff");
});

test("small shift and brightness change keep near-identical frames together", () => {
  const base = Array.from({ length: 72 }, (_, index) => (index % 9) * 20 + Math.floor(index / 9));
  const adjusted = base.map((value, index) => value + 12 + (index % 17 === 0 ? -25 : 0));
  const firstHash = dHashFromGrayscale(base), secondHash = dHashFromGrayscale(adjusted);
  assert.ok(hammingDistance(firstHash, secondHash) <= SIMILARITY_HASH_THRESHOLD);
  assert.equal(getSimilarPhotoGroups([photo("first.jpg", firstHash), photo("shifted.jpg", secondHash, 4)]).length, 1);
});

test("clearly different photos, distant times, and aspect ratios do not group", () => {
  assert.equal(getSimilarPhotoGroups([photo("a.jpg", "0000000000000000"), photo("b.jpg", "ffffffffffffffff")]).length, 0);
  assert.equal(getSimilarPhotoGroups([photo("a.jpg", "0".repeat(16)), photo("late.jpg", "0".repeat(16), 6)]).length, 0);
  assert.equal(getSimilarPhotoGroups([photo("a.jpg", "0".repeat(16)), photo("portrait.jpg", "0".repeat(16), 1, 3000, 4000)]).length, 0);
});

test("the inclusive threshold is predictably 16 bits", () => {
  assert.equal(SIMILARITY_HASH_THRESHOLD, 16);
  assert.equal(hammingDistance("0000000000000000", hashWithBits(16)), 16);
  assert.equal(getSimilarPhotoGroups([photo("a.jpg", "0000000000000000"), photo("at-limit.jpg", hashWithBits(16))]).length, 1);
  assert.equal(getSimilarPhotoGroups([photo("a.jpg", "0000000000000000"), photo("over-limit.jpg", hashWithBits(17))]).length, 0);
});

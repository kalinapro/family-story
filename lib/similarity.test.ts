import assert from "node:assert/strict";
import test from "node:test";
import { compareCandidatePair, dHashFromRgba, getCandidatePairs, hammingDistance } from "./similarity.ts";

function syntheticImage(sample: (x: number, y: number) => number): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(9 * 8 * 4);
  for (let y = 0; y < 8; y += 1) for (let x = 0; x < 9; x += 1) {
    const value = Math.max(0, Math.min(255, sample(x, y)));
    const offset = (y * 9 + x) * 4;
    pixels.set([value, value, value, 255], offset);
  }
  return pixels;
}

const scene = (x: number, y: number) => 110 + 45 * Math.sin(x * 1.3) + 35 * Math.cos(y * 1.2);
const hash = (sample: (x: number, y: number) => number) => dHashFromRgba(syntheticImage(sample), 9, 8);

test("synthetic perceptual distances distinguish expected image changes", () => {
  const original = hash(scene);
  const identical = hash(scene);
  const brighter = hash((x, y) => scene(x, y) + 8);
  const shifted = hash((x, y) => scene(Math.min(8, x + 1), y));
  const different = hash((x, y) => 255 - scene(x, y));

  assert.equal(hammingDistance(original, identical), 0, "identical image");
  assert.ok(hammingDistance(original, brighter) <= 4, "small brightness change");
  assert.ok(hammingDistance(original, shifted) > 4 && hammingDistance(original, shifted) < 50, "small shift/crop");
  assert.ok(hammingDistance(original, different) >= 50, "different image");
  assert.equal(original.length, 64);
});

test("Hamming distance validates hashes and counts differing bits", () => {
  assert.equal(hammingDistance("0".repeat(64), "1".repeat(64)), 64);
  assert.throws(() => hammingDistance("0".repeat(63), "1".repeat(64)), /64-bit/);
});

test("candidate comparison uses EXIF time, aspect ratio, and pixel hashes", () => {
  const now = new Date("2024-01-01T12:00:00Z");
  const first = { id: "a", fileName: "a.jpg", takenAt: now, perceptual: { hash: "0".repeat(64), aspectRatio: 1.5, pixelDataReadable: true, orientationApplied: true } };
  const second = { ...first, id: "b", fileName: "b.jpg", takenAt: new Date(now.getTime() + 1_000) };
  assert.deepEqual(compareCandidatePair(first, second), { first, second, timeDifferenceSeconds: 1, distance: 0, similar: true, rejectionReason: undefined });
  assert.equal(getCandidatePairs([first, { ...second, takenAt: new Date(now.getTime() + 301_000) }]).length, 0);
});

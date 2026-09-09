import assert from "node:assert/strict";
import test from "node:test";
import { compareCandidatePair, dHashFromRgba, getCandidatePairs, groupSimilarPhotos, hammingDistance } from "./similarity.ts";

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
  assert.deepEqual(compareCandidatePair(first, second), { first, second, timeDifferenceSeconds: 1, distance: 0, luminanceDistance: null, similar: true, rejectionReason: undefined });
  assert.equal(getCandidatePairs([first, { ...second, takenAt: new Date(now.getTime() + 301_000) }]).length, 0);
});

test("slightly shifted frames in one burst form one group using aligned dHashes", () => {
  const takenAt = new Date("2024-01-01T12:00:00Z");
  const base = "0".repeat(64), moved = "1".repeat(14) + "0".repeat(50);
  const photos = [
    { id: "a", fileName: "a.jpg", takenAt, perceptual: { hash: base, hashVariants: [base], aspectRatio: 1.5, pixelDataReadable: true, orientationApplied: true } },
    { id: "b", fileName: "b.jpg", takenAt: new Date(takenAt.getTime() + 1_000), perceptual: { hash: moved, hashVariants: [moved, "1".repeat(6) + "0".repeat(58)], aspectRatio: 1.5, pixelDataReadable: true, orientationApplied: true } },
    { id: "c", fileName: "c.jpg", takenAt: new Date(takenAt.getTime() + 2_000), perceptual: { hash: "1".repeat(8) + "0".repeat(56), aspectRatio: 1.5, pixelDataReadable: true, orientationApplied: true } },
  ];
  assert.equal(groupSimilarPhotos(photos).length, 1);
  assert.deepEqual(groupSimilarPhotos(photos)[0].map((photo) => photo.id), ["a", "b", "c"]);
});

test("visually different scenes are not grouped even when capture times are close", () => {
  const takenAt = new Date("2024-01-01T12:00:00Z");
  const common = { aspectRatio: 1.5, pixelDataReadable: true, orientationApplied: true };
  const photos = [
    { id: "a", fileName: "a.jpg", takenAt, perceptual: { ...common, hash: "0".repeat(64), luminanceSignature: Array.from({ length: 16 }, (_, index) => index < 8 ? -60 : 60) } },
    { id: "b", fileName: "b.jpg", takenAt: new Date(takenAt.getTime() + 1_000), perceptual: { ...common, hash: "0".repeat(64), luminanceSignature: Array.from({ length: 16 }, (_, index) => index < 8 ? 60 : -60) } },
  ];
  assert.equal(compareCandidatePair(photos[0], photos[1]).rejectionReason, "luminance layout differs");
  assert.deepEqual(groupSimilarPhotos(photos), []);
});

test("EXIF times one and two seconds apart are all considered", () => {
  const start = new Date("2024-01-01T12:00:00Z");
  const photos = [0, 1, 2].map((seconds) => ({ id: String(seconds), fileName: `${seconds}.jpg`, takenAt: new Date(start.getTime() + seconds * 1_000) }));
  assert.equal(getCandidatePairs(photos).length, 3);
  assert.deepEqual(getCandidatePairs(photos).map((pair) => pair.timeDifferenceSeconds), [1, 2, 1]);
});

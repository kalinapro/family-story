import assert from "node:assert/strict";
import test from "node:test";
import { areComparisonCandidates, assignSimilarityGroups, dHashFromGrayscale, hammingDistance, keepOnlySelected, recommendedPhoto, SIMILARITY_TIME_WINDOW_MS } from "./similarity.ts";

const hash = (bits: string) => BigInt(`0b${bits}`).toString(16).padStart(16, "0");
const photo = (id: string, perceptualHash: string, minute: number | null, qualityScore = 50) => ({
  id, perceptualHash, takenAt: minute === null ? null : new Date(Date.UTC(2024, 0, 1, 12, minute)),
  hash: `${id}-sha`, qualityScore, similarityGroupId: null, selectedForStory: true,
});

test("dHash describes horizontal brightness changes", () => {
  const increasing = Array.from({ length: 72 }, (_, index) => index % 9);
  const decreasing = Array.from({ length: 72 }, (_, index) => 8 - index % 9);
  assert.equal(dHashFromGrayscale(increasing), "0000000000000000");
  assert.equal(dHashFromGrayscale(decreasing), "ffffffffffffffff");
});

test("calculates Hamming distance between perceptual hashes", () => {
  assert.equal(hammingDistance("0000000000000000", "000000000000000f"), 4);
  assert.equal(hammingDistance("abc", "ab"), Number.POSITIVE_INFINITY);
});

test("combines similar photos into a group", () => {
  const result = assignSimilarityGroups([photo("a", hash("0".repeat(64)), 0), photo("b", hash("0".repeat(60) + "1111"), 3)]);
  assert.ok(result[0].similarityGroupId);
  assert.equal(result[0].similarityGroupId, result[1].similarityGroupId);
});

test("does not group visually different photos", () => {
  const result = assignSimilarityGroups([photo("a", "0000000000000000", 0), photo("b", "ffffffffffffffff", 1)]);
  assert.deepEqual(result.map((item) => item.similarityGroupId), [null, null]);
});

test("limits dated candidates to five minutes", () => {
  const first = photo("a", "0".repeat(16), 0), near = photo("b", "0".repeat(16), 5), far = photo("c", "0".repeat(16), 6);
  assert.equal(areComparisonCandidates(first, near, 0, 1), true);
  assert.equal(areComparisonCandidates(first, far, 0, 2), false);
  assert.equal(SIMILARITY_TIME_WINDOW_MS, 300_000);
});

test("recommends the highest quality frame", () => {
  const group = [photo("soft", "0".repeat(16), 0, 34), photo("best", "0".repeat(16), 1, 88)];
  assert.equal(recommendedPhoto(group)?.id, "best");
});

test("keeps the selected frame and excludes the rest without deleting", () => {
  const input = [photo("one", "0".repeat(16), 0), photo("two", "0".repeat(16), 1)].map((item) => ({ ...item, similarityGroupId: "series" }));
  const result = keepOnlySelected(input, "series", "two");
  assert.equal(result.length, 2);
  assert.deepEqual(result.map((item) => item.selectedForStory), [false, true]);
});

import assert from "node:assert/strict";
import test from "node:test";
import { calculateQualityScore } from "./quality.ts";

const healthy = { width: 3000, height: 2000, fileSize: 2_000_000, meanLuminance: 128, contrast: 55, edgeStrength: 28, clippedDarkRatio: .01, clippedLightRatio: .01 };

test("quality score is normalized to 0–100", () => {
  const score = calculateQualityScore(healthy);
  assert.ok(score >= 0 && score <= 100);
  assert.ok(calculateQualityScore({ ...healthy, edgeStrength: 1, meanLuminance: 0, clippedDarkRatio: 1 }) < score);
});

test("sharp, correctly exposed images outrank blurred or clipped images", () => {
  const good = calculateQualityScore(healthy);
  assert.ok(good > calculateQualityScore({ ...healthy, edgeStrength: 2 }));
  assert.ok(good > calculateQualityScore({ ...healthy, meanLuminance: 245, clippedLightRatio: .8 }));
});

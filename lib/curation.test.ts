import assert from "node:assert/strict";
import test from "node:test";
import { chooseBestPhoto, getSimilarStats, keepAll, keepOnlySelected, resolveRecommendedPhoto } from "./curation.ts";

const photos = [
  { id: "a", qualityScore: 62, selectedForStory: true },
  { id: "b", qualityScore: 91, selectedForStory: true },
  { id: "c", qualityScore: 74, selectedForStory: true },
];

test("chooses the highest quality frame", () => assert.equal(chooseBestPhoto(photos)?.id, "b"));
test("manual frame selection overrides automatic recommendation", () => assert.equal(resolveRecommendedPhoto(photos, "a")?.id, "a"));
test("keeps selected frame and excludes the rest without deleting", () => {
  const result = keepOnlySelected(photos, ["a", "b", "c"], "c");
  assert.equal(result.length, 3);
  assert.deepEqual(result.map((photo) => photo.selectedForStory), [false, false, true]);
});
test("keep all returns every frame to the story", () => assert.ok(keepAll(keepOnlySelected(photos, ["a", "b", "c"], "a"), ["a", "b", "c"]).every((photo) => photo.selectedForStory)));
test("similar statistics recalculate after exclusions", () => {
  assert.deepEqual(getSimilarStats([photos]), { similarPhotos: 3, series: 1 });
  assert.deepEqual(getSimilarStats([keepOnlySelected(photos, ["a", "b", "c"], "b")]), { similarPhotos: 0, series: 0 });
});

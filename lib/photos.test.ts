import assert from "node:assert/strict";
import test from "node:test";
import { getDuplicateGroups, getPhotoStats, setStoryParticipation, sortPhotos } from "./photos.ts";
import { groupPhotosIntoEvents } from "./events.ts";

const photo = (id: string, date: string | null, selectedForStory = true, hash?: string) => ({
  id, fileName: `${id}.jpg`, takenAt: date ? new Date(date) : null, selectedForStory, hash,
  faceIds: [], qualityScore: null, similarityGroupId: null,
});

test("sorts by date in both directions", () => {
  const input = [photo("new", "2024-01-01"), photo("old", "2020-01-01")];
  assert.deepEqual(sortPhotos(input, "oldest").map((item) => item.id), ["old", "new"]);
  assert.deepEqual(sortPhotos(input, "newest").map((item) => item.id), ["new", "old"]);
});

test("keeps undated photos at the end of date sorting", () => {
  const input = [photo("none", null), photo("dated", "2020-01-01")];
  assert.deepEqual(sortPhotos(input, "newest").map((item) => item.id), ["dated", "none"]);
});

test("excludes and returns a photo without removing it", () => {
  const input = [photo("one", "2020-01-01")];
  const excluded = setStoryParticipation(input, "one", false);
  assert.equal(excluded.length, 1);
  assert.equal(excluded[0].selectedForStory, false);
  assert.equal(setStoryParticipation(excluded, "one", true)[0].selectedForStory, true);
});

test("excluded photos do not form timeline events", () => {
  const groups = groupPhotosIntoEvents([photo("included", "2020-01-01"), photo("excluded", "2021-01-01", false)]);
  assert.deepEqual(groups.flatMap((group) => group.photos.map((item) => item.id)), ["included"]);
});

test("finds exact duplicates by content hash, not filename", () => {
  const groups = getDuplicateGroups([photo("a", null, true, "same"), photo("b", null, true, "same"), photo("same-name", null, true, "other")]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].map((item) => item.id), ["a", "b"]);
});

test("recalculates collection statistics", () => {
  const stats = getPhotoStats([photo("a", "2020-01-01", true, "same"), photo("b", null, false, "same")]);
  assert.deepEqual(stats, { total: 2, selected: 1, excluded: 1, undated: 1, duplicateGroups: 1, duplicateCopies: 1 });
});

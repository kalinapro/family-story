import assert from "node:assert/strict";
import test from "node:test";
import { groupPhotosIntoEvents } from "./events.ts";

const photo = (date: string | null) => ({ takenAt: date ? new Date(date) : null, name: date ?? "undated" });

test("groups photos within six hours, including exactly six hours", () => {
  const groups = groupPhotosIntoEvents([photo("2020-01-01T10:00:00Z"), photo("2020-01-01T16:00:00Z")]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].photos.length, 2);
});

test("starts another event after a gap longer than six hours", () => {
  const groups = groupPhotosIntoEvents([photo("2020-01-01T10:00:00Z"), photo("2020-01-01T16:00:01Z")]);
  assert.equal(groups.length, 2);
});

test("keeps a short interval across midnight in one event", () => {
  const groups = groupPhotosIntoEvents([photo("2020-01-01T23:00:00Z"), photo("2020-01-02T02:00:00Z")]);
  assert.equal(groups.length, 1);
});

test("sorts dated photos and leaves undated photos out", () => {
  const groups = groupPhotosIntoEvents([photo(null), photo("2020-01-02T10:00:00Z"), photo("2020-01-01T10:00:00Z")]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((group) => group.photos[0].name), ["2020-01-01T10:00:00Z", "2020-01-02T10:00:00Z"]);
});

export type StoryPhoto = {
  id: string;
  takenAt: Date | null;
  fileName: string;
  selectedForStory: boolean;
  hash?: string;
  perceptualHash?: string;
  faceIds: string[];
  qualityScore: number | null;
  similarityGroupId: string | null;
};

export type PhotoSort = "oldest" | "newest" | "name";

export function sortPhotos<T extends Pick<StoryPhoto, "takenAt" | "fileName">>(photos: T[], order: PhotoSort): T[] {
  return [...photos].sort((a, b) => {
    if (order === "name") return a.fileName.localeCompare(b.fileName, "ru", { numeric: true, sensitivity: "base" });
    if (!a.takenAt && !b.takenAt) return a.fileName.localeCompare(b.fileName, "ru", { numeric: true });
    if (!a.takenAt) return 1;
    if (!b.takenAt) return -1;
    const difference = a.takenAt.getTime() - b.takenAt.getTime();
    return order === "oldest" ? difference : -difference;
  });
}

export function setStoryParticipation<T extends { id: string; selectedForStory: boolean }>(photos: T[], id: string, selected: boolean): T[] {
  return photos.map((photo) => photo.id === id ? { ...photo, selectedForStory: selected } : photo);
}

export function getDuplicateGroups<T extends { hash?: string }>(photos: T[]): T[][] {
  const groups = new Map<string, T[]>();
  for (const photo of photos) {
    if (!photo.hash) continue;
    groups.set(photo.hash, [...(groups.get(photo.hash) ?? []), photo]);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

export function getPhotoStats<T extends Pick<StoryPhoto, "takenAt" | "selectedForStory" | "hash">>(photos: T[]) {
  const duplicateGroups = getDuplicateGroups(photos);
  return {
    total: photos.length,
    selected: photos.filter((photo) => photo.selectedForStory).length,
    excluded: photos.filter((photo) => !photo.selectedForStory).length,
    undated: photos.filter((photo) => !photo.takenAt).length,
    duplicateGroups: duplicateGroups.length,
    duplicateCopies: duplicateGroups.reduce((sum, group) => sum + group.length - 1, 0),
  };
}

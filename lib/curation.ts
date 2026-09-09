export type CurationPhoto = { id: string; qualityScore: number | null; selectedForStory: boolean };

export function chooseBestPhoto<T extends CurationPhoto>(group: T[]): T | null {
  return group.reduce<T | null>((best, photo) => !best || (photo.qualityScore ?? 0) > (best.qualityScore ?? 0) ? photo : best, null);
}

export function resolveRecommendedPhoto<T extends CurationPhoto>(group: T[], manualId?: string): T | null {
  return group.find((photo) => photo.id === manualId) ?? chooseBestPhoto(group);
}

export function keepOnlySelected<T extends CurationPhoto>(photos: T[], groupIds: string[], selectedId: string): T[] {
  const ids = new Set(groupIds);
  return photos.map((photo) => ids.has(photo.id) ? { ...photo, selectedForStory: photo.id === selectedId } : photo);
}

export function keepAll<T extends CurationPhoto>(photos: T[], groupIds: string[]): T[] {
  const ids = new Set(groupIds);
  return photos.map((photo) => ids.has(photo.id) ? { ...photo, selectedForStory: true } : photo);
}

export function getSimilarStats<T extends Pick<CurationPhoto, "id" | "selectedForStory">>(groups: T[][]) {
  const activeGroups = groups.map((group) => group.filter((photo) => photo.selectedForStory)).filter((group) => group.length > 1);
  return { similarPhotos: new Set(activeGroups.flat().map((photo) => photo.id)).size, series: activeGroups.length };
}

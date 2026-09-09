export const SIMILARITY_TIME_WINDOW_MS = 5 * 60 * 1000;
export const SIMILARITY_HASH_THRESHOLD = 10;
export const UNDATED_NEIGHBOR_WINDOW = 12;

export type SimilarityPhoto = {
  id: string;
  takenAt: Date | null;
  hash?: string;
  perceptualHash?: string;
  qualityScore: number | null;
  similarityGroupId: string | null;
  selectedForStory: boolean;
};

/** Computes a 64-bit dHash from a row-major 9×8 array of grayscale pixels. */
export function dHashFromGrayscale(pixels: ArrayLike<number>): string {
  if (pixels.length !== 72) throw new Error("dHash requires a 9×8 grayscale image");
  let bits = "";
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) bits += pixels[y * 9 + x] > pixels[y * 9 + x + 1] ? "1" : "0";
  }
  return Array.from({ length: 16 }, (_, index) => parseInt(bits.slice(index * 4, index * 4 + 4), 2).toString(16)).join("");
}

export function hammingDistance(first: string, second: string): number {
  if (first.length !== second.length) return Number.POSITIVE_INFINITY;
  let distance = 0;
  for (let index = 0; index < first.length; index += 1) {
    let value = parseInt(first[index], 16) ^ parseInt(second[index], 16);
    if (Number.isNaN(value)) return Number.POSITIVE_INFINITY;
    while (value) { distance += value & 1; value >>>= 1; }
  }
  return distance;
}

export function areComparisonCandidates(first: Pick<SimilarityPhoto, "takenAt">, second: Pick<SimilarityPhoto, "takenAt">, firstIndex: number, secondIndex: number): boolean {
  if (first.takenAt && second.takenAt) return Math.abs(first.takenAt.getTime() - second.takenAt.getTime()) <= SIMILARITY_TIME_WINDOW_MS;
  if (!first.takenAt && !second.takenAt) return Math.abs(firstIndex - secondIndex) <= UNDATED_NEIGHBOR_WINDOW;
  return false;
}

/** Connects candidate photos with close dHashes. Identical SHA-256 files are deliberately ignored. */
export function assignSimilarityGroups<T extends SimilarityPhoto>(photos: T[]): T[] {
  const parent = photos.map((_, index) => index);
  const find = (index: number): number => parent[index] === index ? index : (parent[index] = find(parent[index]));
  const join = (a: number, b: number) => { const rootA = find(a), rootB = find(b); if (rootA !== rootB) parent[rootB] = rootA; };
  for (let first = 0; first < photos.length; first += 1) {
    if (!photos[first].perceptualHash) continue;
    for (let second = first + 1; second < photos.length; second += 1) {
      if (!areComparisonCandidates(photos[first], photos[second], first, second)) continue;
      if (!photos[second].perceptualHash || (photos[first].hash && photos[first].hash === photos[second].hash)) continue;
      if (hammingDistance(photos[first].perceptualHash!, photos[second].perceptualHash!) <= SIMILARITY_HASH_THRESHOLD) join(first, second);
    }
  }
  const members = new Map<number, number[]>();
  photos.forEach((_, index) => members.set(find(index), [...(members.get(find(index)) ?? []), index]));
  const groupByIndex = new Map<number, string>();
  for (const indexes of members.values()) if (indexes.length >= 2) {
    const groupId = `similar-${indexes.map((index) => photos[index].id).sort().join("-")}`;
    indexes.forEach((index) => groupByIndex.set(index, groupId));
  }
  return photos.map((photo, index) => ({ ...photo, similarityGroupId: groupByIndex.get(index) ?? null }));
}

export function getSimilarityGroups<T extends Pick<SimilarityPhoto, "similarityGroupId">>(photos: T[]): T[][] {
  const groups = new Map<string, T[]>();
  photos.forEach((photo) => { if (photo.similarityGroupId) groups.set(photo.similarityGroupId, [...(groups.get(photo.similarityGroupId) ?? []), photo]); });
  return [...groups.values()].filter((group) => group.length >= 2);
}

export function recommendedPhoto<T extends Pick<SimilarityPhoto, "qualityScore">>(group: T[]): T | undefined {
  return group.reduce<T | undefined>((best, photo) => !best || (photo.qualityScore ?? -1) > (best.qualityScore ?? -1) ? photo : best, undefined);
}

export function keepOnlySelected<T extends Pick<SimilarityPhoto, "id" | "similarityGroupId" | "selectedForStory">>(photos: T[], groupId: string, selectedId: string): T[] {
  return photos.map((photo) => photo.similarityGroupId === groupId ? { ...photo, selectedForStory: photo.id === selectedId } : photo);
}

export function keepAllInGroup<T extends Pick<SimilarityPhoto, "similarityGroupId" | "selectedForStory">>(photos: T[], groupId: string): T[] {
  return photos.map((photo) => photo.similarityGroupId === groupId ? { ...photo, selectedForStory: true } : photo);
}

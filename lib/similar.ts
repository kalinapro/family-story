export const SIMILARITY_HASH_THRESHOLD = 16;
export const SIMILARITY_TIME_WINDOW_MS = 5 * 60 * 1000;
export const SIMILARITY_ASPECT_RATIO_TOLERANCE = 0.08;

export type SimilarPhoto = {
  fileName: string;
  takenAt: Date | null;
  perceptualHash?: string;
  width?: number;
  height?: number;
};

/** Builds the 64 comparisons of a 9×8 dHash and returns exactly 16 hex digits. */
export function dHashFromGrayscale(samples: ArrayLike<number>): string {
  if (samples.length !== 9 * 8) throw new Error("dHash requires a 9×8 grayscale image");
  let hash = 0n;
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      hash = (hash << 1n) | (samples[y * 9 + x] < samples[y * 9 + x + 1] ? 1n : 0n);
    }
  }
  return hash.toString(16).padStart(16, "0");
}

export function rgbaToGrayscale(data: ArrayLike<number>): Uint8Array {
  if (data.length !== 9 * 8 * 4) throw new Error("dHash requires 9×8 RGBA pixels");
  const grayscale = new Uint8Array(9 * 8);
  for (let pixel = 0; pixel < grayscale.length; pixel += 1) {
    const offset = pixel * 4;
    // ITU-R BT.601 luma; alpha is intentionally irrelevant for ordinary photos.
    grayscale[pixel] = Math.round(0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2]);
  }
  return grayscale;
}

export function hammingDistance(first: string, second: string): number {
  if (!/^[0-9a-f]{16}$/i.test(first) || !/^[0-9a-f]{16}$/i.test(second)) throw new Error("dHash must be a 64-bit hexadecimal value");
  let difference = BigInt(`0x${first}`) ^ BigInt(`0x${second}`);
  let distance = 0;
  while (difference) {
    difference &= difference - 1n;
    distance += 1;
  }
  return distance;
}

function hasCloseAspectRatio(first: SimilarPhoto, second: SimilarPhoto): boolean {
  if (!first.width || !first.height || !second.width || !second.height) return false;
  const firstRatio = first.width / first.height;
  const secondRatio = second.width / second.height;
  return Math.abs(firstRatio - secondRatio) / Math.max(firstRatio, secondRatio) <= SIMILARITY_ASPECT_RATIO_TOLERANCE;
}

export function getSimilarPhotoGroups<T extends SimilarPhoto>(photos: T[], debug = false): T[][] {
  const parent = photos.map((_, index) => index);
  const find = (index: number): number => parent[index] === index ? index : (parent[index] = find(parent[index]));
  const join = (first: number, second: number) => { parent[find(second)] = find(first); };

  for (let first = 0; first < photos.length; first += 1) {
    for (let second = first + 1; second < photos.length; second += 1) {
      const a = photos[first], b = photos[second];
      if (!a.takenAt || !b.takenAt || !a.perceptualHash || !b.perceptualHash || !hasCloseAspectRatio(a, b)) continue;
      const timeDifference = Math.abs(a.takenAt.getTime() - b.takenAt.getTime());
      if (timeDifference > SIMILARITY_TIME_WINDOW_MS) continue;
      const distance = hammingDistance(a.perceptualHash, b.perceptualHash);
      if (debug) console.debug("[similar-photos] candidate", { files: [a.fileName, b.fileName], timeDifferenceMs: timeDifference, hammingDistance: distance });
      if (distance <= SIMILARITY_HASH_THRESHOLD) join(first, second);
    }
  }

  const groups = new Map<number, T[]>();
  photos.forEach((photo, index) => groups.set(find(index), [...(groups.get(find(index)) ?? []), photo]));
  return [...groups.values()].filter((group) => group.length > 1);
}

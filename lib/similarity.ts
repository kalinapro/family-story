export const SIMILARITY_WINDOW_SECONDS = 5 * 60;
export const DHASH_BITS = 64;
export const DHASH_SIMILAR_DISTANCE = 10;
export const ASPECT_RATIO_TOLERANCE = 0.08;
export const LUMINANCE_DISTANCE_THRESHOLD = 28;

export type PerceptualImage = {
  hash: string;
  /** dHashes of nearby crops; compensates for the small camera movement common in a burst. */
  hashVariants?: string[];
  /** Mean-normalised 4×4 luminance signature, used to prevent dHash false positives. */
  luminanceSignature?: number[];
  aspectRatio: number;
  pixelDataReadable: boolean;
  orientationApplied: boolean;
};

export type SimilarityPhoto = {
  id: string;
  fileName: string;
  takenAt: Date | null;
  perceptual?: PerceptualImage;
  perceptualError?: string;
};

export type SimilarityPair<T extends SimilarityPhoto = SimilarityPhoto> = {
  first: T;
  second: T;
  timeDifferenceSeconds: number;
  distance: number | null;
  luminanceDistance?: number | null;
  similar: boolean;
  rejectionReason?: string;
};

/** Computes a 64-bit horizontal difference hash from an already resized 9×8 RGBA buffer. */
export function dHashFromRgba(pixels: Uint8ClampedArray, width: number, height: number): string {
  if (width !== 9 || height !== 8 || pixels.length !== width * height * 4) {
    throw new Error("dHash requires exactly 9×8 RGBA pixels");
  }
  let bits = "";
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width - 1; x += 1) {
      const offset = (y * width + x) * 4;
      const nextOffset = offset + 4;
      const luminance = pixels[offset] * 0.299 + pixels[offset + 1] * 0.587 + pixels[offset + 2] * 0.114;
      const nextLuminance = pixels[nextOffset] * 0.299 + pixels[nextOffset + 1] * 0.587 + pixels[nextOffset + 2] * 0.114;
      bits += luminance > nextLuminance ? "1" : "0";
    }
  }
  return bits;
}

export function hammingDistance(first: string, second: string): number {
  if (first.length !== DHASH_BITS || second.length !== DHASH_BITS || /[^01]/.test(first + second)) {
    throw new Error("Hamming distance requires two 64-bit binary dHashes");
  }
  let distance = 0;
  for (let index = 0; index < DHASH_BITS; index += 1) distance += first[index] === second[index] ? 0 : 1;
  return distance;
}

export function minimumHammingDistance(first: PerceptualImage, second: PerceptualImage): number {
  const firstHashes = first.hashVariants?.length ? first.hashVariants : [first.hash];
  const secondHashes = second.hashVariants?.length ? second.hashVariants : [second.hash];
  return Math.min(...firstHashes.flatMap((a) => secondHashes.map((b) => hammingDistance(a, b))));
}

export function luminanceDistance(first?: number[], second?: number[]): number | null {
  if (!first || !second || first.length !== 16 || second.length !== 16) return null;
  return first.reduce((sum, value, index) => sum + Math.abs(value - second[index]), 0) / 16;
}

export function compareCandidatePair<T extends SimilarityPhoto>(first: T, second: T): SimilarityPair<T> {
  const timeDifferenceSeconds = first.takenAt && second.takenAt
    ? Math.abs(first.takenAt.getTime() - second.takenAt.getTime()) / 1000
    : Number.POSITIVE_INFINITY;
  let distance: number | null = null;
  let luminanceDifference: number | null = null;
  let rejectionReason: string | undefined;

  if (!first.takenAt || !second.takenAt) rejectionReason = "missing EXIF capture time";
  else if (timeDifferenceSeconds > SIMILARITY_WINDOW_SECONDS) rejectionReason = "outside 5-minute window";
  else if (!first.perceptual || !second.perceptual) rejectionReason = `pixel hash unavailable${first.perceptualError || second.perceptualError ? `: ${first.perceptualError ?? second.perceptualError}` : ""}`;
  else if (!first.perceptual.pixelDataReadable || !second.perceptual.pixelDataReadable) rejectionReason = "canvas pixel data unavailable";
  else if (first.perceptual.hash.length !== DHASH_BITS || second.perceptual.hash.length !== DHASH_BITS) rejectionReason = "invalid dHash bit length";
  else {
    distance = minimumHammingDistance(first.perceptual, second.perceptual);
    luminanceDifference = luminanceDistance(first.perceptual.luminanceSignature, second.perceptual.luminanceSignature);
    const aspectDelta = Math.abs(first.perceptual.aspectRatio - second.perceptual.aspectRatio) /
      Math.max(first.perceptual.aspectRatio, second.perceptual.aspectRatio);
    if (aspectDelta > ASPECT_RATIO_TOLERANCE) rejectionReason = "aspect ratios differ";
    else if (distance > DHASH_SIMILAR_DISTANCE) rejectionReason = "Hamming distance above threshold";
    else if (luminanceDifference !== null && luminanceDifference > LUMINANCE_DISTANCE_THRESHOLD) rejectionReason = "luminance layout differs";
  }
  return { first, second, timeDifferenceSeconds, distance, luminanceDistance: luminanceDifference, similar: !rejectionReason, rejectionReason };
}

export function getCandidatePairs<T extends SimilarityPhoto>(photos: T[]): SimilarityPair<T>[] {
  const pairs: SimilarityPair<T>[] = [];
  for (let first = 0; first < photos.length; first += 1) {
    for (let second = first + 1; second < photos.length; second += 1) {
      const pair = compareCandidatePair(photos[first], photos[second]);
      if (pair.timeDifferenceSeconds <= SIMILARITY_WINDOW_SECONDS) pairs.push(pair);
    }
  }
  return pairs;
}

export function groupSimilarPhotos<T extends SimilarityPhoto>(photos: T[], pairs = getCandidatePairs(photos)): T[][] {
  const parent = new Map(photos.map((photo) => [photo.id, photo.id]));
  const find = (id: string): string => { const root = parent.get(id)!; if (root === id) return id; const result = find(root); parent.set(id, result); return result; };
  for (const pair of pairs) if (pair.similar) parent.set(find(pair.second.id), find(pair.first.id));
  const groups = new Map<string, T[]>();
  for (const photo of photos) groups.set(find(photo.id), [...(groups.get(find(photo.id)) ?? []), photo]);
  return [...groups.values()].filter((group) => group.length > 1);
}

export type ImageQualityMetrics = {
  width: number;
  height: number;
  fileSize: number;
  meanLuminance: number;
  contrast: number;
  edgeStrength: number;
  clippedDarkRatio: number;
  clippedLightRatio: number;
};

const clamp = (value: number, minimum = 0, maximum = 1) => Math.min(maximum, Math.max(minimum, value));

/** A deterministic, local 0–100 score. Sharpness and usable exposure carry most weight. */
export function calculateQualityScore(metrics: ImageQualityMetrics): number {
  const sharpness = clamp(metrics.edgeStrength / 32);
  const resolution = clamp(Math.log2(Math.max(1, metrics.width * metrics.height) / 500_000) / 3);
  const exposureCenter = 1 - clamp(Math.abs(metrics.meanLuminance - 127.5) / 127.5);
  const clipping = clamp(1 - (metrics.clippedDarkRatio + metrics.clippedLightRatio) * 2.5);
  const exposure = exposureCenter * 0.45 + clipping * 0.55;
  const contrast = clamp(metrics.contrast / 64);
  const fileSignal = clamp(Math.log2(Math.max(1, metrics.fileSize) / 100_000) / 5);
  return Math.round(clamp(sharpness * 0.4 + exposure * 0.3 + contrast * 0.15 + resolution * 0.12 + fileSignal * 0.03) * 100);
}

export function qualityMetricsFromRgba(
  pixels: Uint8ClampedArray,
  sampleWidth: number,
  sampleHeight: number,
  sourceWidth: number,
  sourceHeight: number,
  fileSize: number,
): ImageQualityMetrics {
  const luminances: number[] = [];
  let dark = 0, light = 0, edgeTotal = 0, edgeCount = 0;
  for (let y = 0; y < sampleHeight; y += 1) for (let x = 0; x < sampleWidth; x += 1) {
    const offset = (y * sampleWidth + x) * 4;
    const value = pixels[offset] * .299 + pixels[offset + 1] * .587 + pixels[offset + 2] * .114;
    luminances.push(value);
    if (value < 18) dark += 1;
    if (value > 237) light += 1;
    if (x) { edgeTotal += Math.abs(value - luminances[luminances.length - 2]); edgeCount += 1; }
    if (y) { edgeTotal += Math.abs(value - luminances[(y - 1) * sampleWidth + x]); edgeCount += 1; }
  }
  const meanLuminance = luminances.reduce((sum, value) => sum + value, 0) / luminances.length;
  const variance = luminances.reduce((sum, value) => sum + (value - meanLuminance) ** 2, 0) / luminances.length;
  return { width: sourceWidth, height: sourceHeight, fileSize, meanLuminance, contrast: Math.sqrt(variance), edgeStrength: edgeTotal / Math.max(1, edgeCount), clippedDarkRatio: dark / luminances.length, clippedLightRatio: light / luminances.length };
}

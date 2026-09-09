import type { FaceDetection } from "./people";

type NativeFace = { boundingBox: DOMRectReadOnly };
type NativeFaceDetector = { detect(source: ImageBitmapSource): Promise<NativeFace[]> };
type NativeFaceDetectorConstructor = new (options?: { fastMode?: boolean; maxDetectedFaces?: number }) => NativeFaceDetector;

export const FACE_ANALYSIS_MAX_SIZE = 960;

function descriptorFromCrop(context: CanvasRenderingContext2D, box: DOMRectReadOnly): number[] {
  const size = 8, sample = document.createElement("canvas"); sample.width = size; sample.height = size;
  const target = sample.getContext("2d", { willReadFrequently: true })!;
  target.drawImage(context.canvas, box.x, box.y, box.width, box.height, 0, 0, size, size);
  const pixels = target.getImageData(0, 0, size, size).data; const values: number[] = [];
  for (let index = 0; index < pixels.length; index += 4) values.push((pixels[index] * .299 + pixels[index + 1] * .587 + pixels[index + 2] * .114) / 255);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const centered = values.map((value) => value - mean), norm = Math.sqrt(centered.reduce((sum, value) => sum + value * value, 0)) || 1;
  return centered.map((value) => value / norm);
}

export function supportsLocalFaceDetection(): boolean { return typeof window !== "undefined" && "FaceDetector" in window; }

export async function analyzePhotoFaces(file: File, photoId: string): Promise<FaceDetection[]> {
  const Constructor = (window as unknown as { FaceDetector?: NativeFaceDetectorConstructor }).FaceDetector;
  if (!Constructor) throw new Error("FACE_DETECTOR_UNAVAILABLE");
  const bitmap = await createImageBitmap(file); const scale = Math.min(1, FACE_ANALYSIS_MAX_SIZE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas"); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d", { willReadFrequently: true })!; context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  const faces = await new Constructor({ fastMode: false, maxDetectedFaces: 20 }).detect(canvas);
  return faces.map(({ boundingBox }) => ({ id: crypto.randomUUID(), photoId, descriptor: descriptorFromCrop(context, boundingBox), box: { x: boundingBox.x / canvas.width, y: boundingBox.y / canvas.height, width: boundingBox.width / canvas.width, height: boundingBox.height / canvas.height }, confidence: 1 }));
}

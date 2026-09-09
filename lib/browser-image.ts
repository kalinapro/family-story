import { dHashFromRgba, PerceptualImage } from "./similarity";

function cropHash(pixels: Uint8ClampedArray, sourceWidth: number, left: number, top: number) {
  const crop = new Uint8ClampedArray(9 * 8 * 4);
  for (let y = 0; y < 8; y += 1) for (let x = 0; x < 9; x += 1) {
    crop.set(pixels.subarray(((y + top) * sourceWidth + x + left) * 4, ((y + top) * sourceWidth + x + left) * 4 + 4), (y * 9 + x) * 4);
  }
  return dHashFromRgba(crop, 9, 8);
}

function luminanceSignature(pixels: Uint8ClampedArray, width: number, height: number) {
  const values: number[] = [];
  for (let gy = 0; gy < 4; gy += 1) for (let gx = 0; gx < 4; gx += 1) {
    const x = Math.min(width - 1, Math.floor((gx + 0.5) * width / 4));
    const y = Math.min(height - 1, Math.floor((gy + 0.5) * height / 4));
    const offset = (y * width + x) * 4;
    values.push(pixels[offset] * .299 + pixels[offset + 1] * .587 + pixels[offset + 2] * .114);
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.map((value) => Math.round(value - mean));
}

/** Decodes local file pixels with EXIF orientation applied before hashing. */
export async function createPerceptualImage(file: File): Promise<PerceptualImage> {
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const canvas = document.createElement("canvas");
    canvas.width = 11;
    canvas.height = 10;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("2D canvas context unavailable");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    if (pixels.length !== canvas.width * canvas.height * 4) throw new Error("Canvas returned incomplete pixel data");
    const hashVariants = [0, 1, 2].flatMap((top) => [0, 1, 2].map((left) => cropHash(pixels, canvas.width, left, top)));
    const hash = hashVariants[4];
    return {
      hash,
      hashVariants,
      luminanceSignature: luminanceSignature(pixels, canvas.width, canvas.height),
      aspectRatio: bitmap.width / bitmap.height,
      pixelDataReadable: true,
      orientationApplied: true,
    };
  } finally {
    bitmap?.close();
  }
}

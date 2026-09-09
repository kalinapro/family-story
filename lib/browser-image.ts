import { dHashFromRgba, PerceptualImage } from "./similarity";

/** Decodes local file pixels with EXIF orientation applied before hashing. */
export async function createPerceptualImage(file: File): Promise<PerceptualImage> {
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const canvas = document.createElement("canvas");
    canvas.width = 9;
    canvas.height = 8;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("2D canvas context unavailable");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    if (pixels.length !== 9 * 8 * 4) throw new Error("Canvas returned incomplete pixel data");
    const hash = dHashFromRgba(pixels, canvas.width, canvas.height);
    return {
      hash,
      aspectRatio: bitmap.width / bitmap.height,
      pixelDataReadable: true,
      orientationApplied: true,
    };
  } finally {
    bitmap?.close();
  }
}

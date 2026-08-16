import { getConfig } from "@/lib/config";

const SIGNATURES: Array<{ mime: string; test: (b: Buffer) => boolean }> = [
  { mime: "image/png", test: (b) => b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) },
  { mime: "image/jpeg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: "image/webp",
    test: (b) => b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP",
  },
  { mime: "image/heic", test: (b) => b.subarray(4, 8).toString() === "ftyp" },
];

export interface ValidatedImage {
  bytes: Buffer;
  mime: string;
  size: number;
}

/**
 * Trust the file's magic bytes over its declared Content-Type — iOS Shortcuts
 * routinely mislabels HEIC and PNG.
 */
export async function validateImage(file: File): Promise<ValidatedImage> {
  const cfg = getConfig();
  const buffer = Buffer.from(await file.arrayBuffer());

  if (!buffer.length) throw new Error("The uploaded image is empty.");
  if (buffer.length > cfg.maxImageBytes) {
    const mb = (cfg.maxImageBytes / (1024 * 1024)).toFixed(0);
    throw new Error(`Image is too large (max ${mb}MB).`);
  }
  // Guards against the 70-byte placeholder uploads that polluted the old store.
  if (buffer.length < 1024) {
    throw new Error("The uploaded image is too small to be a real screenshot.");
  }

  const detected = SIGNATURES.find((sig) => sig.test(buffer));
  if (!detected) {
    throw new Error("Unsupported image format. Use PNG, JPEG, WebP, or HEIC.");
  }

  return { bytes: buffer, mime: detected.mime, size: buffer.length };
}

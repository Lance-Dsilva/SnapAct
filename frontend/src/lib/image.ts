import sharp from "sharp";
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
 * Vercel rejects function request bodies over ~4.5MB with a plain-text 413 before
 * any of our code runs — measured: 4.08MB passes, 5.10MB fails. Keeping our own
 * limit just below that means an oversized screenshot gets a JSON error
 * explaining the fix, instead of an unparseable platform error.
 */
export const PLATFORM_BODY_LIMIT_BYTES = 4 * 1024 * 1024;

const CONVERT_HINT =
  "Add a “Convert Image” action (to JPEG) in your Shortcut before the request — it fixes this and makes uploads much faster.";

/**
 * Trust the file's magic bytes over its declared Content-Type — iOS Shortcuts
 * routinely mislabels HEIC and PNG.
 */
export async function validateImage(file: File): Promise<ValidatedImage> {
  const cfg = getConfig();
  const buffer = Buffer.from(await file.arrayBuffer());

  if (!buffer.length) throw new Error("The uploaded image is empty.");

  const limit = Math.min(cfg.maxImageBytes, PLATFORM_BODY_LIMIT_BYTES);
  if (buffer.length > limit) {
    const mb = (buffer.length / (1024 * 1024)).toFixed(1);
    throw new Error(
      `That screenshot is ${mb}MB — the upload limit is ${(limit / (1024 * 1024)).toFixed(0)}MB. ${CONVERT_HINT}`,
    );
  }
  // Guards against the tiny placeholder uploads that polluted the old store.
  if (buffer.length < 1024) {
    throw new Error("The uploaded image is too small to be a real screenshot.");
  }

  const detected = SIGNATURES.find((sig) => sig.test(buffer));
  if (!detected) {
    throw new Error("Unsupported image format. Use PNG, JPEG, or WebP.");
  }

  // The vision model cannot read HEIC. Convert it here so the failure surfaces
  // now with an actionable message, rather than 20s later in the background.
  if (detected.mime === "image/heic") {
    try {
      const converted = await sharp(buffer).jpeg({ quality: 85 }).toBuffer();
      return { bytes: converted, mime: "image/jpeg", size: converted.length };
    } catch {
      throw new Error(`SnapAct cannot read HEIC images. ${CONVERT_HINT}`);
    }
  }

  return { bytes: buffer, mime: detected.mime, size: buffer.length };
}

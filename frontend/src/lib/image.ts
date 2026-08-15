import { getConfig } from "@/lib/config";

const ALLOWED = new Set(["image/png", "image/jpeg", "image/jpg"]);

export async function validateImageFile(file: File | null): Promise<{
  bytes: Buffer;
  contentType: "image/png" | "image/jpeg";
}> {
  const cfg = getConfig();
  if (!file) throw new Error("Image file is required.");

  const name = (file.name || "").toLowerCase();
  let contentType = (file.type || "").toLowerCase();
  if (contentType === "image/jpg") contentType = "image/jpeg";

  const extOk = name.endsWith(".png") || name.endsWith(".jpg") || name.endsWith(".jpeg");
  if (contentType && !ALLOWED.has(contentType) && !extOk) {
    throw new Error(`Unsupported image type '${contentType || name}'. Use PNG or JPEG.`);
  }

  const ab = await file.arrayBuffer();
  const bytes = Buffer.from(ab);
  if (!bytes.length) throw new Error("Uploaded image is empty.");
  if (bytes.length > cfg.maxImageBytes) {
    throw new Error(`Image too large. Maximum size is ${(cfg.maxImageBytes / (1024 * 1024)).toFixed(0)} MB.`);
  }

  // Light magic-byte check
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
  if (!isPng && !isJpeg) {
    throw new Error("Could not read image. The file may be corrupted. Use a PNG or JPEG screenshot.");
  }

  return {
    bytes,
    contentType: isPng ? "image/png" : "image/jpeg",
  };
}

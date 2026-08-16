import sharp from "sharp";

/**
 * Shrink a screenshot for the vision model.
 *
 * Measured effect on latency is modest (~10%) because generation dominates, but
 * it cuts the uploaded payload by roughly two thirds, which lowers token cost on
 * every background analysis. The original is what gets stored and displayed.
 */
export async function forVisionModel(
  bytes: Buffer,
  mime: string,
): Promise<{ bytes: Buffer; mime: string }> {
  try {
    const resized = await sharp(bytes)
      .resize({ width: 1024, height: 1536, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 78 })
      .toBuffer();
    // Only worth it if it actually saved something.
    return resized.length < bytes.length
      ? { bytes: resized, mime: "image/jpeg" }
      : { bytes, mime };
  } catch (error) {
    console.warn("[images] downscale failed; sending the original", error);
    return { bytes, mime };
  }
}

import { getConfig } from "@/lib/config";
import { db } from "@/lib/db/supabase";

function extensionFor(mime: string) {
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("heic")) return "heic";
  return "png";
}

/** Foldered by user so the bucket stays navigable as the corpus grows. */
export function makeImagePath(userId: string, id: string, mime: string) {
  const safeUser = userId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${safeUser}/${id}.${extensionFor(mime)}`;
}

export async function uploadScreenshot(input: {
  bytes: Buffer;
  mime: string;
  path: string;
}): Promise<void> {
  const cfg = getConfig();
  const { error } = await db()
    .storage.from(cfg.supabaseBucket)
    .upload(input.path, input.bytes, {
      contentType: input.mime,
      upsert: true,
    });
  if (error) throw new Error(`Screenshot upload failed: ${error.message}`);
}

/** Batch-sign private objects. Returns a path -> URL map; misses are simply absent. */
export async function signImageUrl(
  paths: string[],
  ttlSeconds: number,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!paths.length) return out;

  const cfg = getConfig();
  const { data, error } = await db()
    .storage.from(cfg.supabaseBucket)
    .createSignedUrls(paths, ttlSeconds);

  if (error) {
    console.warn("[storage] signing failed", error.message);
    return out;
  }
  for (const item of data ?? []) {
    if (item.signedUrl && item.path) out.set(item.path, item.signedUrl);
  }
  return out;
}

export async function deleteScreenshot(path: string): Promise<void> {
  const cfg = getConfig();
  await db().storage.from(cfg.supabaseBucket).remove([path]);
}

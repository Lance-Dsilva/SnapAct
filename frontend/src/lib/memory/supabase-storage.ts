import { getConfig } from "@/lib/config";

function extensionFor(contentType: string) {
  if (contentType.includes("jpeg")) return "jpg";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("gif")) return "gif";
  return "png";
}

function storageHeaders(extra?: Record<string, string>) {
  const cfg = getConfig();
  const key = cfg.supabaseSecretKey || cfg.supabasePublishableKey;
  if (!key || !cfg.supabaseUrl) return null;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    ...extra,
  };
}

export function makeImagePath(externalId: string, contentType: string) {
  return `${externalId}.${extensionFor(contentType)}`;
}

export async function uploadScreenshot(input: {
  imageBytes: Buffer;
  contentType: string;
  imagePath: string;
}): Promise<{ imagePath: string; imageUrl: string | null }> {
  const cfg = getConfig();
  const headers = storageHeaders({
    "Content-Type": input.contentType || "image/png",
    "x-upsert": "true",
  });
  if (!headers || !cfg.supabaseUrl) {
    throw new Error("Supabase storage is not configured");
  }

  const objectUrl = `${cfg.supabaseUrl.replace(/\/$/, "")}/storage/v1/object/${cfg.supabaseBucket}/${input.imagePath}`;
  const res = await fetch(objectUrl, {
    method: "POST",
    headers,
    body: new Uint8Array(input.imageBytes),
    signal: AbortSignal.timeout(cfg.memoryHttpTimeoutMs),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase upload failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const signed = await signScreenshotUrl(input.imagePath);
  return { imagePath: input.imagePath, imageUrl: signed };
}

export async function signScreenshotUrl(imagePath: string): Promise<string | null> {
  const cfg = getConfig();
  const headers = storageHeaders({ "Content-Type": "application/json" });
  if (!headers || !cfg.supabaseUrl) return null;
  const res = await fetch(
    `${cfg.supabaseUrl.replace(/\/$/, "")}/storage/v1/object/sign/${cfg.supabaseBucket}/${imagePath}`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ expiresIn: 60 * 60 * 24 * 7 }),
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!res.ok) return null;
  const payload = (await res.json()) as { signedURL?: string; signedUrl?: string };
  const path = payload.signedURL || payload.signedUrl;
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `${cfg.supabaseUrl.replace(/\/$/, "")}/storage/v1${path.startsWith("/") ? path : `/${path}`}`;
}

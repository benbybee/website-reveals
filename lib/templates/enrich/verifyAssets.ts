import type { CanonicalRecord } from "../types";

export interface VerifyResult {
  ok: boolean;
  contentType: string | null;
}

/**
 * HEAD-check a single asset URL: must be 2xx AND an image content-type.
 * Auth-walled pages (200 text/html) and dead URLs (4xx/5xx) fail.
 */
export async function verifyUrl(url: string): Promise<VerifyResult> {
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow" });
    const contentType = res.headers.get("content-type");
    const ok = res.status >= 200 && res.status < 300 && !!contentType && contentType.startsWith("image/");
    return { ok, contentType };
  } catch {
    return { ok: false, contentType: null };
  }
}

/**
 * Verify every logo/photo URL on a record; drop the ones that fail so SL never
 * receives a broken hero. Returns a new record with only verified assets.
 */
export async function verifyAssets(record: CanonicalRecord): Promise<CanonicalRecord> {
  const out: CanonicalRecord = { ...record };

  if (out.logo?.src_url) {
    const { ok } = await verifyUrl(out.logo.src_url);
    if (!ok) delete out.logo;
  }

  if (out.photos?.length) {
    const verified: typeof out.photos = [];
    for (const photo of out.photos) {
      const { ok } = await verifyUrl(photo.src_url);
      if (ok) verified.push(photo);
    }
    out.photos = verified;
  }

  return out;
}

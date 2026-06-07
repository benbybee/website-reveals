// Postcard artwork lives in the public `tpl-postcards` Supabase Storage bucket.
// Files are uploaded browser->Supabase directly via a signed upload URL minted
// here (service-role), so print-resolution artwork never passes through the
// serverless function (Vercel caps function request bodies at ~4.5 MB).

import type { SupabaseClient } from "@supabase/supabase-js";

export const POSTCARD_BUCKET = "tpl-postcards";
const ALLOWED = new Set(["image/png", "image/jpeg", "application/pdf"]);

export interface SignedUpload {
  path: string;
  token: string;
  publicUrl: string;
}

function extFor(contentType: string): string {
  return contentType === "application/pdf" ? "pdf" : contentType === "image/jpeg" ? "jpg" : "png";
}

export async function signPostcardUpload(
  db: SupabaseClient,
  opts: { designName: string; side: "front" | "back"; contentType: string },
): Promise<SignedUpload> {
  if (!ALLOWED.has(opts.contentType)) {
    throw new Error(`unsupported_type:${opts.contentType} (allowed: PNG, JPEG, PDF)`);
  }
  const safeName = opts.designName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "design";
  const path = `${safeName}/${opts.side}-${Date.now()}.${extFor(opts.contentType)}`;

  const { data, error } = await db.storage.from(POSTCARD_BUCKET).createSignedUploadUrl(path, { upsert: true });
  if (error || !data) throw new Error(`sign_failed: ${error?.message ?? "unknown"}`);

  const { data: pub } = db.storage.from(POSTCARD_BUCKET).getPublicUrl(path);
  return { path, token: data.token, publicUrl: pub.publicUrl };
}

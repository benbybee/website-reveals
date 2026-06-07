// Upload postcard artwork to the public `tpl-postcards` Supabase Storage bucket
// and return a public URL Lob can fetch. Service-role client only (admin surface).

import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "tpl-postcards";
const ALLOWED = new Set(["image/png", "image/jpeg", "application/pdf"]);

export interface UploadResult {
  path: string;
  publicUrl: string;
}

export async function uploadPostcardAsset(
  db: SupabaseClient,
  file: File,
  opts: { designName: string; side: "front" | "back" },
): Promise<UploadResult> {
  if (!ALLOWED.has(file.type)) {
    throw new Error(`unsupported_type:${file.type} (allowed: PNG, JPEG, PDF)`);
  }
  const ext = file.type === "application/pdf" ? "pdf" : file.type === "image/jpeg" ? "jpg" : "png";
  const safeName = opts.designName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "design";
  const path = `${safeName}/${opts.side}-${Date.now()}.${ext}`;

  const bytes = await file.arrayBuffer();
  const { error } = await db.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: file.type, upsert: true });
  if (error) throw new Error(`upload_failed: ${error.message}`);

  const { data } = db.storage.from(BUCKET).getPublicUrl(path);
  return { path, publicUrl: data.publicUrl };
}

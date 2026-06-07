import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { templatesEnabled } from "@/lib/templates/config";
import { tplDb } from "@/lib/templates/db";
import { uploadPostcardAsset } from "@/lib/templates/mail/storage";

const SIZES = new Set(["4x6", "6x9", "6x11"]);

// Multipart PATCH: optionally update name/size and replace front/back artwork.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!templatesEnabled()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;
  const db = tplDb();
  const { data: existing } = await db
    .from("tpl_postcard_designs")
    .select("name")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: "design_not_found" }, { status: 404 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "expected_multipart_form" }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const name = form.get("name");
  if (typeof name === "string" && name.trim()) patch.name = name.trim();
  const size = form.get("size");
  if (typeof size === "string" && size.trim()) {
    if (!SIZES.has(size.trim())) return NextResponse.json({ error: "invalid_size" }, { status: 400 });
    patch.size = size.trim();
  }

  const designName = (patch.name as string) ?? (existing.name as string);
  try {
    const front = form.get("front");
    if (front instanceof File && front.size > 0) {
      patch.front_url = (await uploadPostcardAsset(db, front, { designName, side: "front" })).publicUrl;
    }
    const back = form.get("back");
    if (back instanceof File && back.size > 0) {
      patch.back_url = (await uploadPostcardAsset(db, back, { designName, side: "back" })).publicUrl;
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "upload_failed" }, { status: 400 });
  }

  const { data, error } = await db
    .from("tpl_postcard_designs")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, design: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!templatesEnabled()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;
  const db = tplDb();
  const { error } = await db
    .from("tpl_postcard_designs")
    .update({ archived: true, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

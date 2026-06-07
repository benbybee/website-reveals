import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { templatesEnabled } from "@/lib/templates/config";
import { tplDb } from "@/lib/templates/db";
import { uploadPostcardAsset } from "@/lib/templates/mail/storage";

const SIZES = new Set(["4x6", "6x9", "6x11"]);

export async function GET() {
  if (!templatesEnabled()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const db = tplDb();
  const { data } = await db
    .from("tpl_postcard_designs")
    .select("*")
    .eq("archived", false)
    .order("created_at", { ascending: false });
  return NextResponse.json({ ok: true, designs: data ?? [] });
}

// Multipart: name, size, front (file), back (file). Front/back optional at create
// time so a draft can be saved and artwork attached later (PATCH).
export async function POST(req: NextRequest) {
  if (!templatesEnabled()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "expected_multipart_form" }, { status: 400 });
  }

  const name = String(form.get("name") ?? "").trim();
  const size = String(form.get("size") ?? "4x6").trim();
  if (!name) return NextResponse.json({ error: "missing_name" }, { status: 400 });
  if (!SIZES.has(size)) return NextResponse.json({ error: "invalid_size" }, { status: 400 });

  const db = tplDb();
  const front = form.get("front");
  const back = form.get("back");

  let front_url: string | null = null;
  let back_url: string | null = null;
  try {
    if (front instanceof File && front.size > 0) {
      front_url = (await uploadPostcardAsset(db, front, { designName: name, side: "front" })).publicUrl;
    }
    if (back instanceof File && back.size > 0) {
      back_url = (await uploadPostcardAsset(db, back, { designName: name, side: "back" })).publicUrl;
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "upload_failed" }, { status: 400 });
  }

  const { data, error } = await db
    .from("tpl_postcard_designs")
    .insert({ name, size, front_url, back_url, created_by: auth.user.email })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, design: data });
}

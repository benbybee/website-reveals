import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { templatesEnabled } from "@/lib/templates/config";
import { tplDb } from "@/lib/templates/db";

const SIZES = new Set(["4x6", "6x9", "6x11"]);

interface PatchBody {
  name?: string;
  size?: string;
  front_url?: string | null;
  back_url?: string | null;
}

// JSON PATCH: update name/size and/or replace front/back artwork URLs. Artwork
// bytes are uploaded browser->Supabase via the signed-upload endpoint; only the
// resulting public URLs are sent here.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!templatesEnabled()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;
  const db = tplDb();
  const { data: existing } = await db
    .from("tpl_postcard_designs")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: "design_not_found" }, { status: 404 });

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
  if (typeof body.size === "string" && body.size.trim()) {
    if (!SIZES.has(body.size.trim())) return NextResponse.json({ error: "invalid_size" }, { status: 400 });
    patch.size = body.size.trim();
  }
  if (body.front_url !== undefined) patch.front_url = body.front_url;
  if (body.back_url !== undefined) patch.back_url = body.back_url;

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

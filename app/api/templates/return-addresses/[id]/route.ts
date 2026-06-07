import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { templatesEnabled } from "@/lib/templates/config";
import { tplDb } from "@/lib/templates/db";

interface PatchBody {
  label?: string;
  name?: string;
  address_line1?: string;
  address_line2?: string | null;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  is_default?: boolean;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!templatesEnabled()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;
  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const db = tplDb();
  if (body.is_default === true) {
    await db.from("tpl_return_addresses").update({ is_default: false }).eq("is_default", true);
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of ["label", "name", "address_line1", "address_line2", "city", "zip"] as const) {
    if (body[k] !== undefined) patch[k] = typeof body[k] === "string" ? (body[k] as string).trim() : body[k];
  }
  if (body.state !== undefined) patch.state = body.state.trim().toUpperCase();
  if (body.country !== undefined) patch.country = body.country.trim().toUpperCase();
  if (body.is_default !== undefined) patch.is_default = body.is_default;

  const { data, error } = await db
    .from("tpl_return_addresses")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, address: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!templatesEnabled()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;
  const db = tplDb();
  // Soft-delete: archive so historical mailings keep their reference.
  const { error } = await db
    .from("tpl_return_addresses")
    .update({ archived: true, is_default: false, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

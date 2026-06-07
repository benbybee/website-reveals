import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { templatesEnabled } from "@/lib/templates/config";
import { tplDb } from "@/lib/templates/db";

interface PatchBody {
  postcard_design_id?: string | null;
  return_address_id?: string | null;
}

// Assign (or clear) the postcard design + return address used when mailing this
// campaign. Both are soft references; setting null detaches.
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
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.postcard_design_id !== undefined) {
    if (body.postcard_design_id) {
      const { data: d } = await db.from("tpl_postcard_designs").select("id").eq("id", body.postcard_design_id).maybeSingle();
      if (!d) return NextResponse.json({ error: "design_not_found" }, { status: 400 });
    }
    patch.postcard_design_id = body.postcard_design_id;
  }
  if (body.return_address_id !== undefined) {
    if (body.return_address_id) {
      const { data: r } = await db.from("tpl_return_addresses").select("id").eq("id", body.return_address_id).maybeSingle();
      if (!r) return NextResponse.json({ error: "return_address_not_found" }, { status: 400 });
    }
    patch.return_address_id = body.return_address_id;
  }

  const { data, error } = await db
    .from("tpl_campaigns")
    .update(patch)
    .eq("id", id)
    .select("id, postcard_design_id, return_address_id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, campaign: data });
}

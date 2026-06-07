import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { templatesEnabled } from "@/lib/templates/config";
import { tplDb } from "@/lib/templates/db";

interface PatchBody {
  display_name?: string;
  google_categories?: string[] | string;
  sl_slug?: string;
}

function normalizeCategories(input: string[] | string): string[] {
  const arr = Array.isArray(input) ? input : input.split(",");
  return arr.map((c) => c.trim()).filter(Boolean);
}

// Edit a row's editable fields. The slug itself is immutable — it is the join key
// campaigns reference, so changing it would orphan them; create a new industry
// instead if the name is wrong.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  if (!templatesEnabled()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { slug } = await params;
  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.display_name !== undefined) {
    const dn = body.display_name.trim();
    if (!dn) return NextResponse.json({ error: "display_name cannot be empty" }, { status: 400 });
    patch.display_name = dn;
  }
  if (body.sl_slug !== undefined) patch.sl_slug = body.sl_slug.trim() || slug;
  if (body.google_categories !== undefined) patch.google_categories = normalizeCategories(body.google_categories);
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });

  const db = tplDb();
  const { data, error } = await db
    .from("tpl_industries")
    .update(patch)
    .eq("slug", slug)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, industry: data });
}

// Hard-delete a reference row, but only if no campaign still points at it — an
// orphaned campaign would silently fall back to scraping its raw slug string.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  if (!templatesEnabled()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { slug } = await params;
  const db = tplDb();

  const { count } = await db
    .from("tpl_campaigns")
    .select("id", { count: "exact", head: true })
    .eq("industry_slug", slug);
  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: "industry_in_use", campaigns: count }, { status: 409 });
  }

  const { error } = await db.from("tpl_industries").delete().eq("slug", slug);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

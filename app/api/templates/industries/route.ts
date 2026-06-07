import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { templatesEnabled } from "@/lib/templates/config";
import { tplDb } from "@/lib/templates/db";
import { slugifyIndustry } from "@/lib/templates/industries";

interface CreateBody {
  display_name?: string;
  google_categories?: string[] | string;
  sl_slug?: string;
}

// Accept categories as an array or a comma-separated string; trim + drop empties.
function normalizeCategories(input: string[] | string | undefined): string[] {
  const arr = Array.isArray(input) ? input : (input ?? "").split(",");
  return arr.map((c) => c.trim()).filter(Boolean);
}

export async function GET() {
  if (!templatesEnabled()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const db = tplDb();
  const { data } = await db
    .from("tpl_industries")
    .select("*")
    .order("display_name", { ascending: true });
  return NextResponse.json({ ok: true, industries: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!templatesEnabled()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const displayName = (body.display_name ?? "").trim();
  if (!displayName) return NextResponse.json({ error: "display_name is required" }, { status: 400 });

  const slug = slugifyIndustry(displayName);
  if (!slug) return NextResponse.json({ error: "display_name has no slug-able characters" }, { status: 400 });

  const slSlug = (body.sl_slug ?? "").trim() || slug;
  const categories = normalizeCategories(body.google_categories);

  const db = tplDb();
  const { data, error } = await db
    .from("tpl_industries")
    .insert({ slug, display_name: displayName, google_categories: categories, sl_slug: slSlug })
    .select("*")
    .single();
  if (error) {
    // 23505 = unique_violation on slug
    if (error.code === "23505") return NextResponse.json({ error: "industry_already_exists", slug }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, industry: data }, { status: 201 });
}

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createServerClient } from "@/lib/supabase/server";
import { isValidIndustrySlug } from "@/lib/industries";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { slug } = await params;
  if (!isValidIndustrySlug(slug)) {
    return NextResponse.json({ error: "Unknown industry slug" }, { status: 404 });
  }
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("industry_aliases")
    .select("*")
    .eq("industry_slug", slug)
    .order("alias_keyword", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ aliases: data || [] });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { slug } = await params;
  if (!isValidIndustrySlug(slug)) {
    return NextResponse.json({ error: "Unknown industry slug" }, { status: 404 });
  }
  const body = await req.json().catch(() => null);
  const keyword = typeof body?.alias_keyword === "string" ? body.alias_keyword.trim().toLowerCase() : "";
  if (!keyword) return NextResponse.json({ error: "alias_keyword is required" }, { status: 400 });

  // "other" can't own aliases — its whole purpose is the unmatched bucket.
  if (slug === "other") {
    return NextResponse.json({ error: "Cannot add aliases to the Other category" }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("industry_aliases")
    .insert({ industry_slug: slug, alias_keyword: keyword })
    .select()
    .single();
  if (error) {
    if (error.message.includes("duplicate") || error.message.includes("unique")) {
      return NextResponse.json({ error: "That alias already exists for this industry" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ alias: data });
}

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
    .from("industry_references")
    .select("*")
    .eq("industry_slug", slug)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ references: data || [] });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { slug } = await params;
  if (!isValidIndustrySlug(slug)) {
    return NextResponse.json({ error: "Unknown industry slug" }, { status: 404 });
  }
  const body = await req.json().catch(() => null);
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  const label = typeof body?.label === "string" ? body.label.trim() : null;
  if (!url) return NextResponse.json({ error: "url is required" }, { status: 400 });
  try {
    new URL(url);
  } catch {
    return NextResponse.json({ error: "url must be a valid absolute URL" }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("industry_references")
    .insert({ industry_slug: slug, url, label: label || null })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reference: data });
}

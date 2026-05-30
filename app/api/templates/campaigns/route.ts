import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { templatesEnabled } from "@/lib/templates/config";
import { tplDb } from "@/lib/templates/db";

interface LocationInput {
  state: string;
  city?: string;
  radius?: number;
}

interface CreateCampaignBody {
  industry_slug?: string;
  locations?: LocationInput[];
  target_count?: number;
  audit_enabled?: boolean;
}

/** Task 8.1 — create a Template Site campaign. */
export async function POST(req: NextRequest) {
  if (!templatesEnabled()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  let body: CreateCampaignBody;
  try {
    body = (await req.json()) as CreateCampaignBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const industrySlug = (body.industry_slug || "").trim();
  if (!industrySlug) {
    return NextResponse.json({ error: "industry_slug is required" }, { status: 400 });
  }
  if (!Array.isArray(body.locations) || body.locations.length === 0) {
    return NextResponse.json({ error: "at least one location is required" }, { status: 400 });
  }
  for (const loc of body.locations) {
    if (!loc || typeof loc.state !== "string" || !loc.state.trim()) {
      return NextResponse.json({ error: "each location requires a state" }, { status: 400 });
    }
  }

  const db = tplDb();
  const { data, error } = await db
    .from("tpl_campaigns")
    .insert({
      industry_slug: industrySlug,
      locations: body.locations,
      target_count: Math.max(0, Math.floor(body.target_count ?? 0)),
      audit_enabled: body.audit_enabled === true,
      status: "draft",
      created_by: auth.user.email,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ id: (data as { id: string }).id }, { status: 201 });
}

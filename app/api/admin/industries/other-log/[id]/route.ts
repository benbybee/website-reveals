import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createServerClient } from "@/lib/supabase/server";
import { isValidIndustrySlug } from "@/lib/industries";

/**
 * PATCH actions on an industry_other_log row.
 *
 * Two distinct workflows:
 *
 *  action="map_to" + target_slug + alias_keyword
 *    Admin reviewed the entry and wants to teach the system. We insert an
 *    alias row (slug + keyword) and mark the log row admin_mapped so it
 *    drops off the pending list. Future "Other → <keyword>" entries will
 *    auto-resolve.
 *
 *  action="ignore"
 *    Admin decided the entry isn't worth mapping (one-off, junk, etc.).
 *    Just flip status to 'ignored'.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const action = body.action as string;
  const supabase = createServerClient();

  if (action === "ignore") {
    const { error } = await supabase
      .from("industry_other_log")
      .update({ status: "ignored", resolved_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "map_to") {
    const targetSlug = typeof body.target_slug === "string" ? body.target_slug : "";
    const keyword = typeof body.alias_keyword === "string" ? body.alias_keyword.trim().toLowerCase() : "";
    if (!targetSlug || !isValidIndustrySlug(targetSlug) || targetSlug === "other") {
      return NextResponse.json({ error: "target_slug must be one of the fixed industries (not 'other')" }, { status: 400 });
    }
    if (!keyword) {
      return NextResponse.json({ error: "alias_keyword is required" }, { status: 400 });
    }

    // Upsert the alias so we don't double-fail on existing keyword.
    const { error: aliasErr } = await supabase
      .from("industry_aliases")
      .upsert({ industry_slug: targetSlug, alias_keyword: keyword }, { onConflict: "industry_slug,alias_keyword" });
    if (aliasErr) return NextResponse.json({ error: `Alias create failed: ${aliasErr.message}` }, { status: 500 });

    const { error: logErr } = await supabase
      .from("industry_other_log")
      .update({
        status: "admin_mapped",
        resolved_industry_slug: targetSlug,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (logErr) return NextResponse.json({ error: logErr.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

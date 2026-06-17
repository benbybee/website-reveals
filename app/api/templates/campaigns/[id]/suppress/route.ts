import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { templatesEnabled } from "@/lib/templates/config";
import { tplDb } from "@/lib/templates/db";
import { parseKeywords, buildNameOrFilter } from "@/lib/templates/suppressKeywords";

interface SuppressBody {
  /** Free-form comma-separated keywords, or a pre-split array. */
  keywords?: string | string[];
  /** Preview the match count + sample names without suppressing anything. */
  dryRun?: boolean;
}

/**
 * Keyword "Clean list" — suppress every ACTIVE prospect in this campaign whose
 * business_name contains ANY of the given keywords (case-insensitive substring).
 * Non-destructive: sets suppressed_at so the leads move to the Suppressed list,
 * out of the working list + build/export/mail pools, and can be restored.
 * Scope is this campaign only. dryRun returns { matched, samples } for the
 * preview-then-confirm modal.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!templatesEnabled()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;
  let body: SuppressBody = {};
  try {
    body = (await req.json()) as SuppressBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const keywords = parseKeywords(body.keywords);
  if (keywords.length === 0) return NextResponse.json({ error: "no_keywords" }, { status: 400 });
  const orFilter = buildNameOrFilter(keywords);

  const db = tplDb();

  if (body.dryRun === true) {
    const { data, count, error } = await db
      .from("tpl_prospects")
      .select("business_name", { count: "exact" })
      .eq("campaign_id", id)
      .is("suppressed_at", null)
      .or(orFilter)
      .limit(10);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({
      ok: true,
      matched: count ?? 0,
      samples: (data ?? []).map((r) => (r as { business_name: string | null }).business_name).filter(Boolean),
      keywords,
    });
  }

  // Gather the matching active ids in this campaign, then suppress them via the
  // RPC (which detaches campaign_id + recomputes the campaign's counts atomically).
  const { data: matches, error: selErr } = await db
    .from("tpl_prospects")
    .select("id")
    .eq("campaign_id", id)
    .is("suppressed_at", null)
    .or(orFilter);
  if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 });
  const ids = (matches ?? []).map((r) => (r as { id: string }).id);
  if (ids.length === 0) return NextResponse.json({ ok: true, suppressed: 0, keywords });

  const { data, error } = await db.rpc("tpl_suppress_prospects", {
    p_ids: ids,
    p_by: auth.user.email,
    p_reason: `keyword: ${keywords.join(", ")}`,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, suppressed: (data as number) ?? 0, keywords });
}

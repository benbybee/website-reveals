import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { templatesEnabled } from "@/lib/templates/config";
import { tplDb } from "@/lib/templates/db";

const MAX_PAGE_SIZE = 100;

interface SuppressedRow {
  id: string;
  business_name: string | null;
  city: string | null;
  state: string | null;
  campaign_id: string | null;
  suppressed_at: string | null;
  suppression_reason: string | null;
  industry: string | null;
}

/**
 * Cross-campaign Suppressed list — every prospect with suppressed_at set, newest
 * first, filterable by industry (canonical record->>industry_slug) and business
 * name, paginated. Powers the /admin/templates/suppressed page + its Restore.
 */
export async function GET(req: NextRequest) {
  if (!templatesEnabled()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const sp = req.nextUrl.searchParams;
  const industry = sp.get("industry");
  const q = (sp.get("q") || "").trim();
  const page = Math.max(0, Number(sp.get("page") || 0));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(sp.get("pageSize") || 50)));
  const from = page * pageSize;

  const db = tplDb();
  // Suppressed rows have campaign_id = NULL (detached); the origin campaign is in
  // suppressed_from_campaign_id — aliased to campaign_id so the board's label
  // lookup is unchanged.
  let query = db
    .from("tpl_prospects")
    .select(
      "id, business_name, city, state, campaign_id:suppressed_from_campaign_id, suppressed_at, suppression_reason, industry:record->>industry_slug",
      { count: "exact" },
    )
    .not("suppressed_at", "is", null);
  if (industry) query = query.eq("record->>industry_slug", industry);
  if (q) query = query.ilike("business_name", `%${q}%`);

  const { data, count, error } = await query
    .order("suppressed_at", { ascending: false })
    .range(from, from + pageSize - 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    rows: (data ?? []) as SuppressedRow[],
    total: count ?? 0,
    page,
    pageSize,
  });
}

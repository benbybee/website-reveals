import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { templatesEnabled } from "@/lib/templates/config";
import { tplDb } from "@/lib/templates/db";

const MAX_PAGE_SIZE = 200;

/** Task 8.5 — paged, filterable prospect list for a campaign's CRM table. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!templatesEnabled()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;
  const sp = req.nextUrl.searchParams;

  const page = Math.max(0, parseInt(sp.get("page") ?? "0", 10) || 0);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(sp.get("pageSize") ?? "50", 10) || 50));
  const from = page * pageSize;
  const to = from + pageSize - 1;

  const db = tplDb();
  // Embed the prospect's mailing (0 or 1, via the prospect_id FK) so the table
  // can show mail status + QR scan activity without a second round trip.
  let query = db
    .from("tpl_prospects")
    .select("*, tpl_mailings(status, scan_count, last_scanned_at)", { count: "exact" })
    .eq("campaign_id", id);

  const stage = sp.get("stage");
  if (stage) query = query.eq("stage", stage);

  const websiteStatus = sp.get("website_status");
  if (websiteStatus) query = query.eq("website_status", websiteStatus);

  const agent = sp.get("agent");
  if (agent) query = query.eq("agent_id", agent);

  // missing-field filter: completeness jsonb holds a `missing` array of field keys.
  const missing = sp.get("missing");
  if (missing) query = query.contains("completeness", { missing: [missing] });

  query = query.order("created_at", { ascending: false }).range(from, to);

  const { data, error, count } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    prospects: data ?? [],
    page,
    pageSize,
    total: count ?? 0,
  });
}

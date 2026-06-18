import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { templatesEnabled } from "@/lib/templates/config";
import { tplDb } from "@/lib/templates/db";
import { applyProspectFilters } from "@/lib/templates/prospectFilters";

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

  // idsOnly: return EVERY matching id for the current filter (not just this
  // page), so the table's "select all N" can load the whole filtered set into
  // its selection. Keyset-paged to clear Supabase's 1000-row select cap; capped
  // at the bulk-action ceiling so a selection can always be acted on.
  if (sp.get("idsOnly")) {
    const CAP = 5000;
    const PAGE = 1000;
    const ids: string[] = [];
    for (let lastId = ""; ids.length < CAP; ) {
      let q = db.from("tpl_prospects").select("id").eq("campaign_id", id);
      q = applyProspectFilters(q, sp);
      if (lastId) q = q.gt("id", lastId);
      const { data, error } = await q.order("id", { ascending: true }).limit(PAGE);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const rows = (data ?? []) as { id: string }[];
      ids.push(...rows.map((r) => r.id));
      if (rows.length < PAGE) break;
      lastId = rows[rows.length - 1].id;
    }
    return NextResponse.json({ ids: ids.slice(0, CAP), capped: ids.length >= CAP });
  }

  // Embed the prospect's mailing (0 or 1, via the prospect_id FK) so the table
  // can show mail status + QR scan activity without a second round trip.
  let query = db
    .from("tpl_prospects")
    .select("*, tpl_mailings(status, scan_count, last_scanned_at)", { count: "exact" })
    .eq("campaign_id", id);

  // Shared with the CSV export so "export what you're looking at" can't drift.
  query = applyProspectFilters(query, sp);

  // Alphabetical by business name (id as a stable tiebreaker for paging).
  query = query
    .order("business_name", { ascending: true, nullsFirst: false })
    .order("id", { ascending: true })
    .range(from, to);

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

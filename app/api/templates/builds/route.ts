import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { templatesEnabled } from "@/lib/templates/config";
import { tplDb } from "@/lib/templates/db";

// The stages a dispatched build can hold. Anything earlier (qualified, scraped,
// …) hasn't been sent to SL and isn't a "build" yet.
const BUILD_STAGES = ["building", "live", "build_failed"] as const;
const MAX_PAGE_SIZE = 100;

interface BuildRow {
  id: string;
  business_name: string | null;
  city: string | null;
  state: string | null;
  stage: string;
  sl_build_id: string | null;
  preview_url: string | null;
  campaign_id: string | null;
  updated_at: string | null;
  build_error: string | null;
}

/**
 * List template builds (dispatched prospects) with their SL status, for the
 * Builds admin page. Server-side filter (status / campaign / search) + paging so
 * it scales past 500. Also returns per-stage counts for the summary tiles
 * (computed with the campaign/search filters but NOT the status filter, so the
 * operator always sees the full building/live/failed breakdown).
 */
export async function GET(req: NextRequest) {
  if (!templatesEnabled()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const sp = req.nextUrl.searchParams;
  const status = sp.get("status"); // building | live | build_failed | null(all)
  const campaign = sp.get("campaign");
  const q = (sp.get("q") || "").trim();
  const page = Math.max(0, Number(sp.get("page") || 0));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(sp.get("pageSize") || 50)));

  const db = tplDb();

  // --- list query (status filter + pagination) ---
  let listQ = db
    .from("tpl_prospects")
    .select(
      "id, business_name, city, state, stage, sl_build_id, preview_url, campaign_id, updated_at, build_error:record->>build_error",
      { count: "exact" },
    );
  listQ = (status && (BUILD_STAGES as readonly string[]).includes(status))
    ? listQ.eq("stage", status)
    : listQ.in("stage", BUILD_STAGES as unknown as string[]);
  if (campaign) listQ = listQ.eq("campaign_id", campaign);
  if (q) listQ = listQ.ilike("business_name", `%${q}%`);
  const from = page * pageSize;
  const { data, count, error } = await listQ
    .order("updated_at", { ascending: false })
    .range(from, from + pageSize - 1);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // --- per-stage tiles (scope filters only, head counts) ---
  const counts: Record<string, number> = {};
  await Promise.all(
    BUILD_STAGES.map(async (s) => {
      let cq = db.from("tpl_prospects").select("id", { count: "exact", head: true }).eq("stage", s);
      if (campaign) cq = cq.eq("campaign_id", campaign);
      if (q) cq = cq.ilike("business_name", `%${q}%`);
      const { count: c } = await cq;
      counts[s] = c ?? 0;
    }),
  );

  return NextResponse.json({
    builds: (data ?? []) as BuildRow[],
    total: count ?? 0,
    counts,
    page,
    pageSize,
  });
}

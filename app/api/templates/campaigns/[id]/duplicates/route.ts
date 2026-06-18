import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { templatesEnabled } from "@/lib/templates/config";
import { tplDb } from "@/lib/templates/db";
import { computeDuplicateGroups, type DupRow } from "@/lib/templates/duplicates";

interface Body {
  /** false = apply (suppress the duplicate copies); anything else = preview. */
  dryRun?: boolean;
}

/**
 * Find duplicate businesses in a campaign (by normalized name) and, on apply,
 * suppress the redundant copies — keeping one per group and NEVER touching a
 * lead with a site generated. Removal is non-destructive (suppress → restorable
 * on the Suppressed page), via the same detach+recount RPC. Both preview and
 * apply recompute from current data, so apply never acts on stale ids.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!templatesEnabled()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;
  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    /* default preview */
  }

  const db = tplDb();
  const { data, error } = await db
    .from("tpl_prospects")
    .select("id, business_name, preview_url, stage, phone, city, website, created_at")
    .eq("campaign_id", id)
    .is("suppressed_at", null)
    .limit(10000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const result = computeDuplicateGroups((data ?? []) as DupRow[]);

  if (body.dryRun !== false) {
    return NextResponse.json({
      ok: true,
      removable: result.removable,
      groupCount: result.groups.length,
      // Cap the previewed groups so the payload stays small on big campaigns.
      groups: result.groups.slice(0, 30).map((g) => ({ name: g.name, total: g.total, remove: g.removeIds.length })),
    });
  }

  if (result.removeIds.length === 0) return NextResponse.json({ ok: true, suppressed: 0 });
  const { data: n, error: rpcErr } = await db.rpc("tpl_suppress_prospects", {
    p_ids: result.removeIds,
    p_by: auth.user.email,
    p_reason: "duplicate",
  });
  if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 });
  return NextResponse.json({ ok: true, suppressed: (n as number) ?? 0 });
}

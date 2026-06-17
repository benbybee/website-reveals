import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { templatesEnabled } from "@/lib/templates/config";
import { tplDb } from "@/lib/templates/db";
import { rebuildProspects } from "@/lib/templates/sl/rebuild";

interface RebuildBody {
  /** Prospects to re-arm (by tpl_prospects.id). Typically build_failed rows. */
  prospectIds?: string[];
  dryRun?: boolean;
}

/**
 * Manually re-dispatch (rebuild) selected template builds — the operator action
 * behind the Builds page "Rebuild" buttons. Re-arms each failed build in place
 * via SL `retry: true`. Campaign-agnostic; reusable for one or many at 500+ scale.
 */
export async function POST(req: NextRequest) {
  if (!templatesEnabled()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  let body: RebuildBody = {};
  try {
    body = (await req.json()) as RebuildBody;
  } catch {
    /* empty body → no-op below */
  }

  const ids = Array.isArray(body.prospectIds) ? body.prospectIds.filter((x) => typeof x === "string") : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "no prospectIds provided" }, { status: 400 });
  }

  try {
    const result = await rebuildProspects(tplDb(), ids, { dryRun: body.dryRun === true });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "rebuild failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

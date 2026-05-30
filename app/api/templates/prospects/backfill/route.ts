import { NextRequest, NextResponse } from "next/server";
import { tasks as triggerTasks } from "@trigger.dev/sdk/v3";
import { requireAdmin } from "@/lib/admin-auth";
import { templatesEnabled } from "@/lib/templates/config";
import { estimate } from "@/lib/templates/apify/estimate";
import { TPL_TASK_IDS, BACKFILL_ACTOR } from "@/lib/templates/trigger/ids";

interface BackfillBody {
  prospectIds?: string[];
  dryRun?: boolean;
}

/** Task 8.4 — backfill missing fields on an incomplete-prospect subset. */
export async function POST(req: NextRequest) {
  if (!templatesEnabled()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  let body: BackfillBody;
  try {
    body = (await req.json()) as BackfillBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const prospectIds = Array.isArray(body.prospectIds) ? body.prospectIds : [];
  if (prospectIds.length === 0) {
    return NextResponse.json({ error: "prospectIds is required" }, { status: 400 });
  }

  if (body.dryRun) {
    const n = prospectIds.length;
    return NextResponse.json({ dryRun: true, prospects: n, ...estimate(BACKFILL_ACTOR, n) });
  }

  const handle = await triggerTasks.trigger(TPL_TASK_IDS.backfill, { prospectIds });
  return NextResponse.json({ ok: true, runId: handle.id });
}

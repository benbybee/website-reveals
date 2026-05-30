import { NextRequest, NextResponse } from "next/server";
import { tasks as triggerTasks } from "@trigger.dev/sdk/v3";
import { requireAdmin } from "@/lib/admin-auth";
import { templatesEnabled } from "@/lib/templates/config";
import { tplDb } from "@/lib/templates/db";
import { estimate } from "@/lib/templates/apify/estimate";
import { TPL_TASK_IDS, DEEP_AUDIT_ACTORS } from "@/lib/templates/trigger/ids";

interface DeepAuditBody {
  prospectIds?: string[];
  dryRun?: boolean;
}

/** Task 8.3 — deep audit (tech-stack + lighthouse) on a prospect subset. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!templatesEnabled()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;
  let body: DeepAuditBody;
  try {
    body = (await req.json()) as DeepAuditBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const prospectIds = Array.isArray(body.prospectIds) ? body.prospectIds : [];
  if (prospectIds.length === 0) {
    return NextResponse.json({ error: "prospectIds is required" }, { status: 400 });
  }

  if (body.dryRun) {
    const n = prospectIds.length;
    const lines = DEEP_AUDIT_ACTORS.map((actor) => ({ actor, ...estimate(actor, n) }));
    const usd = Math.round(lines.reduce((sum, l) => sum + l.usd, 0) * 1e6) / 1e6;
    return NextResponse.json({ dryRun: true, prospects: n, usd, lines });
  }

  const db = tplDb();
  const { data: campaign } = await db
    .from("tpl_campaigns")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!campaign) {
    return NextResponse.json({ error: "campaign not found" }, { status: 404 });
  }

  const handle = await triggerTasks.trigger(TPL_TASK_IDS.deepAudit, { campaignId: id, prospectIds });
  return NextResponse.json({ ok: true, runId: handle.id });
}

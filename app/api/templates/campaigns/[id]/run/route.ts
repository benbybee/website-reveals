import { NextRequest, NextResponse } from "next/server";
import { tasks as triggerTasks } from "@trigger.dev/sdk/v3";
import { requireAdmin } from "@/lib/admin-auth";
import { templatesEnabled } from "@/lib/templates/config";
import { tplDb } from "@/lib/templates/db";
import { TPL_TASK_IDS } from "@/lib/templates/trigger/ids";

/** Task 8.2 — kick off the discover task for a campaign. */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!templatesEnabled()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;
  const db = tplDb();
  const { data: campaign } = await db
    .from("tpl_campaigns")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!campaign) {
    return NextResponse.json({ error: "campaign not found" }, { status: 404 });
  }

  await db.from("tpl_campaigns").update({ status: "discovering", updated_at: new Date().toISOString() }).eq("id", id);

  const handle = await triggerTasks.trigger(TPL_TASK_IDS.discover, { campaignId: id });
  return NextResponse.json({ ok: true, runId: handle.id });
}

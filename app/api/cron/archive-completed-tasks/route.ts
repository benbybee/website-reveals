import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit-log";

const ARCHIVE_AFTER_DAYS = 7;

/**
 * Vercel Cron: archive any task whose status is 'complete' and whose
 * completed_at is older than ARCHIVE_AFTER_DAYS. Archived tasks stay in
 * the DB but disappear from default queries (which filter
 * archived_at IS NULL). The /admin/archived page surfaces the last 90
 * days of archived tasks.
 *
 * Idempotent — re-running picks up only newly-eligible tasks.
 * Runs daily at 04:10 UTC via vercel.json.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();
  const cutoff = new Date(Date.now() - ARCHIVE_AFTER_DAYS * 86_400_000).toISOString();
  const nowIso = new Date().toISOString();

  const { data: eligible, error: queryErr } = await supabase
    .from("tasks")
    .select("id, title, client_id, completed_at")
    .eq("status", "complete")
    .is("archived_at", null)
    .not("completed_at", "is", null)
    .lt("completed_at", cutoff);

  if (queryErr) {
    console.error("[cron:archive-tasks] Query failed:", queryErr.message);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }
  if (!eligible || eligible.length === 0) {
    return NextResponse.json({ archived: 0 });
  }

  const ids = eligible.map((t) => t.id as string);
  const { error: updateErr } = await supabase
    .from("tasks")
    .update({ archived_at: nowIso })
    .in("id", ids);

  if (updateErr) {
    console.error("[cron:archive-tasks] Update failed:", updateErr.message);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  // Audit each task individually so the trail records what was archived
  for (const t of eligible) {
    void logAudit({
      actor_type: "system",
      actor_id: "cron:archive-tasks",
      action: "task.archived",
      target_type: "task",
      target_id: t.id as string,
      details: {
        title: t.title,
        client_id: t.client_id,
        completed_at: t.completed_at,
        archived_after_days: ARCHIVE_AFTER_DAYS,
      },
    });
  }

  return NextResponse.json({ archived: eligible.length, ids });
}

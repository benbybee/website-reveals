import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin-auth";
import { logAudit } from "@/lib/audit-log";

/**
 * Permanently delete a task. Used from /admin/archived to clean up tasks
 * the sales rep flagged as "not needed".
 *
 * Cascade behavior (verified from migrations):
 *   - task_comments         → CASCADE  (gone with task)
 *   - task_status_history   → CASCADE  (gone with task)
 *   - sub-tasks (parent_id) → CASCADE  (gone with task)
 *   - build_jobs.task_id    → no FK, just an indexed uuid column. Becomes
 *                              an orphan reference so billing audit is
 *                              preserved even after the task is gone.
 *
 * Gated to archived tasks only — refusing to hard-delete a live task
 * prevents accidental clobbering of in-flight work.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id: taskId } = await params;
  const supabase = createServerClient();

  const { data: task, error: taskErr } = await supabase
    .from("tasks")
    .select("id, title, archived_at, sales_outcome, client_id")
    .eq("id", taskId)
    .maybeSingle();
  if (taskErr) {
    return NextResponse.json({ error: taskErr.message }, { status: 500 });
  }
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  if (!task.archived_at) {
    return NextResponse.json(
      { error: "Task is not archived. Archive it first (or mark it complete) before permanent delete." },
      { status: 400 },
    );
  }

  const { error: delErr } = await supabase.from("tasks").delete().eq("id", taskId);
  if (delErr) {
    console.error("[admin:task/permanent] delete failed:", delErr.message);
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  void logAudit({
    actor_type: "admin",
    actor_id: auth.user?.email || null,
    action: "task.permanent_deleted",
    target_type: "task",
    target_id: taskId,
    details: {
      title: task.title,
      sales_outcome: task.sales_outcome,
      client_id: task.client_id,
    },
  });

  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getSalesRepSession } from "@/lib/sales-rep-auth";
import { logAudit } from "@/lib/audit-log";
import { sendClientRequestNotification } from "@/lib/task-emails";

/**
 * Post a comment from a sales rep on one of their own tasks.
 * Tasks the rep doesn't own (via clients.sales_rep_id) are rejected with 403.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSalesRepSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: taskId } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { content, is_request } = body as { content?: unknown; is_request?: unknown };
  if (typeof content !== "string" || !content.trim()) {
    return NextResponse.json({ error: "content required" }, { status: 400 });
  }

  const supabase = createServerClient();

  // Verify the rep owns this task via clients.sales_rep_id
  const { data: task, error: taskErr } = await supabase
    .from("tasks")
    .select("id, title, client_id, clients!inner(id, sales_rep_id, first_name, last_name, company_name, email, pin_hash, pin, form_session_token, created_at, updated_at, website_url, github_repo_url, phone)")
    .eq("id", taskId)
    .maybeSingle();
  if (taskErr || !task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  const client = (task.clients as unknown) as Record<string, unknown>;
  if (!client || client.sales_rep_id !== session.rep_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const isReq = !!is_request;
  const { error: insErr } = await supabase.from("task_comments").insert({
    task_id: taskId,
    author_type: "client", // rep acts on behalf of the client; UI clearly tags them
    author_name: `${session.email} (sales rep)`,
    content: content.trim(),
    is_request: isReq,
  });
  if (insErr) {
    console.error("[sales-rep:comment] insert failed:", insErr.message);
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  void logAudit({
    actor_type: "sales_rep",
    actor_id: session.rep_id,
    action: isReq ? "task.change_requested" : "task.comment_added",
    target_type: "task",
    target_id: taskId,
    details: { length: content.trim().length, is_request: isReq },
  });

  // Notify admin if this is a change request
  if (isReq) {
    try {
      // sendClientRequestNotification expects (client, task, content)
      await sendClientRequestNotification(
        client as unknown as Parameters<typeof sendClientRequestNotification>[0],
        task as unknown as Parameters<typeof sendClientRequestNotification>[1],
        content.trim(),
      );
    } catch (emailErr) {
      console.error("[sales-rep:comment] admin email failed:", emailErr);
    }
  }

  return NextResponse.json({ ok: true });
}

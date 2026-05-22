import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getSalesRepSession } from "@/lib/sales-rep-auth";
import { getSalesRepById } from "@/lib/sales-reps";
import { logAudit } from "@/lib/audit-log";
import { sendSalesOutcomeNotification } from "@/lib/task-emails";
import { sendTelegramMessage } from "@/lib/telegram";
import { isNotificationEnabled } from "@/lib/notification-settings";

type Outcome = "sold" | "not_needed";

/**
 * Sales-rep flags a task as 'sold' (won deal — keeps the row visible) or
 * 'not_needed' (cleanup — archives the row out of active dashboards).
 *
 * Both actions notify the admin via email + Telegram so they know before
 * anything disappears. Rep-owned auth check mirrors the existing comments
 * route — only tasks belonging to a client with sales_rep_id = session.rep_id
 * are mutable.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSalesRepSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: taskId } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { outcome, notes } = body as { outcome?: unknown; notes?: unknown };
  if (outcome !== "sold" && outcome !== "not_needed") {
    return NextResponse.json({ error: "outcome must be 'sold' or 'not_needed'" }, { status: 400 });
  }
  const cleanNotes = typeof notes === "string" && notes.trim() ? notes.trim().slice(0, 2000) : null;

  const supabase = createServerClient();

  // Verify rep owns the task via the client
  const { data: task, error: taskErr } = await supabase
    .from("tasks")
    .select("id, title, client_id, sales_outcome, archived_at, clients!inner(id, sales_rep_id, first_name, last_name, company_name, email)")
    .eq("id", taskId)
    .maybeSingle();
  if (taskErr || !task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  const client = (task.clients as unknown) as {
    id: string;
    sales_rep_id: string | null;
    first_name: string;
    last_name: string;
    company_name: string;
    email: string;
  };
  if (!client || client.sales_rep_id !== session.rep_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Idempotency: if outcome already set to same value, no-op (don't re-fire notifications)
  if (task.sales_outcome === outcome) {
    return NextResponse.json({ ok: true, idempotent: true });
  }

  const nowIso = new Date().toISOString();
  const patch: Record<string, unknown> = {
    sales_outcome: outcome,
    sales_outcome_at: nowIso,
    sales_outcome_by: session.rep_id,
    sales_outcome_notes: cleanNotes,
    updated_at: nowIso,
  };
  // 'not_needed' = soft-delete from active dashboards (admin still sees in /admin/archived).
  // 'sold' = keep visible.
  if (outcome === "not_needed" && !task.archived_at) {
    patch.archived_at = nowIso;
  }

  const { error: updErr } = await supabase.from("tasks").update(patch).eq("id", taskId);
  if (updErr) {
    console.error("[sales-rep:outcome] update failed:", updErr.message);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  // Capture rep details for the admin notification before kicking off side effects.
  const rep = await getSalesRepById(session.rep_id);
  const repName = rep ? `${rep.first_name}${rep.last_name ? " " + rep.last_name : ""}` : "Unknown rep";
  const repEmail = rep?.email || session.email || "unknown";

  void logAudit({
    actor_type: "sales_rep",
    actor_id: session.rep_id,
    action: outcome === "sold" ? "task.marked_sold" : "task.marked_not_needed",
    target_type: "task",
    target_id: taskId,
    details: { outcome, notes_present: !!cleanNotes },
  });

  // Admin notifications. Both gated by the admin audience toggle. Fire-and-forget
  // wrapped in try/catch so a transient email/Telegram failure doesn't undo the
  // outcome write the user already saw succeed.
  const adminAllowed = await isNotificationEnabled("admin").catch(() => true);
  if (adminAllowed) {
    try {
      await sendSalesOutcomeNotification({
        client,
        task: { id: taskId, title: task.title as string },
        outcome: outcome as Outcome,
        repName,
        repEmail,
        notes: cleanNotes,
      });
    } catch (emailErr) {
      console.error("[sales-rep:outcome] email failed:", emailErr);
    }
    try {
      const label = outcome === "sold" ? "✅ SOLD" : "🗑️ NOT NEEDED";
      const lines = [
        `${label} — ${task.title}`,
        ``,
        `Client: ${client.company_name} (${client.first_name} ${client.last_name})`,
        `Rep: ${repName} <${repEmail}>`,
      ];
      if (cleanNotes) lines.push(``, `Notes: ${cleanNotes}`);
      if (outcome === "not_needed") lines.push(``, `Task archived from active dashboards.`);
      await sendTelegramMessage(lines.join("\n"));
    } catch (tgErr) {
      console.error("[sales-rep:outcome] telegram failed:", tgErr);
    }
  }

  return NextResponse.json({ ok: true, outcome, archived: outcome === "not_needed" });
}

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { updateTaskStatus, logTaskCompletion, getTaskById } from "@/lib/tasks";
import { getClientById } from "@/lib/clients";
import { sendStatusChangeEmail } from "@/lib/task-emails";
import { tasks as triggerTasks } from "@trigger.dev/sdk/v3";
import type { TaskStatus } from "@/lib/types/client-tasks";
import { isNotificationEnabled, audienceForClientId } from "@/lib/notification-settings";
import { logAudit } from "@/lib/audit-log";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;

  try {
    const { status, notes } = await req.json();

    if (!status) {
      return NextResponse.json(
        { error: "status is required" },
        { status: 400 }
      );
    }

    const prior = await getTaskById(id);
    const task = await updateTaskStatus(
      id,
      status as TaskStatus,
      notes,
      "admin"
    );

    void logAudit({
      actor_type: "admin",
      actor_id: auth.user?.email || null,
      action: "task.status_changed",
      target_type: "task",
      target_id: id,
      details: {
        from: prior?.status || null,
        to: status,
        notes: notes || null,
      },
    });

    if (status === "complete") {
      await logTaskCompletion(task);
    }

    // Re-estimate on status change (except complete)
    if (status !== "complete") {
      try {
        await triggerTasks.trigger("ai-estimate", { taskId: id });
      } catch (aiErr) {
        console.error("[admin/tasks] AI estimate trigger failed:", aiErr);
      }
    }

    const client = await getClientById(task.client_id);
    if (client) {
      const audience = await audienceForClientId(client.id);
      const allowed = await isNotificationEnabled(audience);
      if (allowed) {
        try {
          await sendStatusChangeEmail(
            client,
            task,
            status as TaskStatus,
            notes
          );
        } catch (emailErr) {
          console.error("[admin/tasks] Status email failed:", emailErr);
        }
      }
    }

    return NextResponse.json({ task });
  } catch (err) {
    console.error("[admin/tasks] Status update error:", err);
    return NextResponse.json(
      { error: "Failed to update status" },
      { status: 500 }
    );
  }
}

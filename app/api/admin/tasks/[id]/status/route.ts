import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { updateTaskStatus, logTaskCompletion, getTaskById } from "@/lib/tasks";
import { getClientById } from "@/lib/clients";
import { sendStatusChangeEmail } from "@/lib/task-emails";
import { tasks as triggerTasks } from "@trigger.dev/sdk/v3";
import type { TaskStatus } from "@/lib/types/client-tasks";

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

    const task = await updateTaskStatus(
      id,
      status as TaskStatus,
      notes,
      "admin"
    );

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

    return NextResponse.json({ task });
  } catch (err) {
    console.error("[admin/tasks] Status update error:", err);
    return NextResponse.json(
      { error: "Failed to update status" },
      { status: 500 }
    );
  }
}

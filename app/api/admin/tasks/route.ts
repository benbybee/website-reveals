import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createTask, getTasksWithClients } from "@/lib/tasks";
import { getClientById } from "@/lib/clients";
import { sendTaskCreatedEmail } from "@/lib/task-emails";
import { tasks } from "@trigger.dev/sdk/v3";
import type { TaskStatus } from "@/lib/types/client-tasks";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") as TaskStatus | null;
  const client_id = searchParams.get("client_id");

  try {
    const tasks = await getTasksWithClients({
      status: status || undefined,
      client_id: client_id || undefined,
    });
    return NextResponse.json({ tasks });
  } catch (err) {
    console.error("[admin/tasks] GET error:", err);
    return NextResponse.json(
      { error: "Failed to fetch tasks" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  try {
    const body = await req.json();
    const { client_id, title } = body;

    if (!client_id || !title) {
      return NextResponse.json(
        { error: "client_id and title are required" },
        { status: 400 }
      );
    }

    const client = await getClientById(client_id);
    if (!client)
      return NextResponse.json(
        { error: "Client not found" },
        { status: 404 }
      );

    const task = await createTask(body);

    try {
      await sendTaskCreatedEmail(client, task);
    } catch (emailErr) {
      console.error("[admin/tasks] Task created email failed:", emailErr);
    }

    // Trigger AI estimation in background
    try {
      await tasks.trigger("ai-estimate", { taskId: task.id });
    } catch (aiErr) {
      console.error("[admin/tasks] AI estimate trigger failed:", aiErr);
    }

    return NextResponse.json({ task }, { status: 201 });
  } catch (err) {
    console.error("[admin/tasks] POST error:", err);
    return NextResponse.json(
      { error: "Failed to create task" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import {
  getTaskById,
  updateTask,
  deleteTask,
  getSubtasks,
  getTaskComments,
  getTaskStatusHistory,
} from "@/lib/tasks";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;

  try {
    const task = await getTaskById(id);
    if (!task)
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      );

    const [subtasks, comments, history] = await Promise.all([
      getSubtasks(id),
      getTaskComments(id),
      getTaskStatusHistory(id),
    ]);

    return NextResponse.json({ task, subtasks, comments, history });
  } catch (err) {
    console.error("[admin/tasks] GET error:", err);
    return NextResponse.json(
      { error: "Failed to fetch task" },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;

  try {
    const body = await req.json();
    const task = await updateTask(id, body);
    return NextResponse.json({ task });
  } catch (err) {
    console.error("[admin/tasks] PUT error:", err);
    return NextResponse.json(
      { error: "Failed to update task" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;

  try {
    await deleteTask(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/tasks] DELETE error:", err);
    return NextResponse.json(
      { error: "Failed to delete task" },
      { status: 500 }
    );
  }
}

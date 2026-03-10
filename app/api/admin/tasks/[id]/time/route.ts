import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { updateTask, getTaskById } from "@/lib/tasks";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;

  try {
    const { minutes } = await req.json();
    if (typeof minutes !== "number" || minutes < 0) {
      return NextResponse.json(
        { error: "minutes must be a positive number" },
        { status: 400 }
      );
    }

    const current = await getTaskById(id);
    if (!current)
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      );

    const task = await updateTask(id, {
      time_tracked_minutes: current.time_tracked_minutes + minutes,
    });

    return NextResponse.json({ task });
  } catch (err) {
    console.error("[admin/tasks] Time update error:", err);
    return NextResponse.json(
      { error: "Failed to update time" },
      { status: 500 }
    );
  }
}

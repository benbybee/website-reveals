import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import {
  addTaskComment,
  getTaskComments,
  getTaskById,
} from "@/lib/tasks";
import { getClientById } from "@/lib/clients";
import { sendCommentNotificationEmail } from "@/lib/task-emails";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;

  try {
    const comments = await getTaskComments(id);
    return NextResponse.json({ comments });
  } catch (err) {
    console.error("[admin/tasks] Comments GET error:", err);
    return NextResponse.json(
      { error: "Failed to fetch comments" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;

  try {
    const { content } = await req.json();
    if (!content)
      return NextResponse.json(
        { error: "content is required" },
        { status: 400 }
      );

    const comment = await addTaskComment({
      task_id: id,
      author_type: "admin",
      author_name: "Ben",
      content,
    });

    const task = await getTaskById(id);
    if (task) {
      const client = await getClientById(task.client_id);
      if (client) {
        try {
          await sendCommentNotificationEmail(client, task, content);
        } catch (emailErr) {
          console.error("[admin/tasks] Comment email failed:", emailErr);
        }
      }
    }

    return NextResponse.json({ comment }, { status: 201 });
  } catch (err) {
    console.error("[admin/tasks] Comment POST error:", err);
    return NextResponse.json(
      { error: "Failed to add comment" },
      { status: 500 }
    );
  }
}

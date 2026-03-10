import { NextRequest, NextResponse } from "next/server";
import { requirePortalAuth } from "@/lib/portal-auth";
import { getTaskById, getTaskComments, addTaskComment } from "@/lib/tasks";
import { getClientById } from "@/lib/clients";
import { sendClientRequestNotification } from "@/lib/task-emails";
import { sendTelegramMessage } from "@/lib/telegram";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePortalAuth();
  if (auth.error) return auth.error;

  const { id } = await params;

  const task = await getTaskById(id);
  if (!task || task.client_id !== auth.session.client_id) {
    return NextResponse.json(
      { error: "Task not found" },
      { status: 404 }
    );
  }

  try {
    const comments = await getTaskComments(id);
    return NextResponse.json({ comments });
  } catch (err) {
    console.error("[portal/comments] GET error:", err);
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
  const auth = await requirePortalAuth();
  if (auth.error) return auth.error;

  const { id } = await params;

  const task = await getTaskById(id);
  if (!task || task.client_id !== auth.session.client_id) {
    return NextResponse.json(
      { error: "Task not found" },
      { status: 404 }
    );
  }

  try {
    const { content, is_request } = await req.json();
    if (!content)
      return NextResponse.json(
        { error: "content is required" },
        { status: 400 }
      );

    const client = await getClientById(auth.session.client_id);
    if (!client)
      return NextResponse.json(
        { error: "Client not found" },
        { status: 404 }
      );

    const comment = await addTaskComment({
      task_id: id,
      author_type: "client",
      author_name: `${client.first_name} ${client.last_name}`,
      content,
      is_request: is_request || false,
    });

    try {
      await sendClientRequestNotification(client, task, content);
    } catch (emailErr) {
      console.error("[portal/comments] Admin notification failed:", emailErr);
    }

    // Notify admin via Telegram
    try {
      const label = is_request ? "Request" : "Comment";
      const telegramMsg = `*New Client ${label}*\nClient: ${client.first_name} ${client.last_name} (${client.company_name})\nTask: ${task.title}\n\n${content}`;
      await sendTelegramMessage(telegramMsg);
    } catch (tgErr) {
      console.error("[portal/comments] Telegram notification failed:", tgErr);
    }

    return NextResponse.json({ comment }, { status: 201 });
  } catch (err) {
    console.error("[portal/comments] POST error:", err);
    return NextResponse.json(
      { error: "Failed to add comment" },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { requirePortalAuth } from "@/lib/portal-auth";
import { getTasks, getSubtasks } from "@/lib/tasks";

export async function GET() {
  const auth = await requirePortalAuth();
  if (auth.error) return auth.error;

  try {
    const tasks = await getTasks({
      client_id: auth.session.client_id,
      parent_only: true,
    });

    const tasksWithSubtasks = await Promise.all(
      tasks.map(async (task) => {
        const subtasks = await getSubtasks(task.id);
        const completedSubtasks = subtasks.filter(
          (s) => s.status === "complete"
        ).length;
        return {
          id: task.id,
          title: task.title,
          description: task.description,
          status: task.status,
          priority: task.priority,
          tags: task.tags,
          due_date: task.due_date,
          estimated_completion_date: task.estimated_completion_date,
          attachments: task.attachments,
          sort_order: task.sort_order,
          created_at: task.created_at,
          completed_at: task.completed_at,
          subtask_count: subtasks.length,
          subtasks_completed: completedSubtasks,
        };
      })
    );

    return NextResponse.json({ tasks: tasksWithSubtasks });
  } catch (err) {
    console.error("[portal/tasks] Error:", err);
    return NextResponse.json(
      { error: "Failed to fetch tasks" },
      { status: 500 }
    );
  }
}

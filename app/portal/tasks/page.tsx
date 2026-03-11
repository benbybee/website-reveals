import { getPortalSession } from "@/lib/portal-auth";
import { getTasks, getSubtasks } from "@/lib/tasks";
import { redirect } from "next/navigation";
import TaskCard from "@/components/portal/TaskCard";
import type { Task, TaskStatus } from "@/lib/types/client-tasks";
import { CompletedSection } from "./CompletedSection";

const STATUS_CONFIG: Record<
  TaskStatus,
  { label: string; color: string }
> = {
  in_progress: { label: "In Progress", color: "#2196f3" },
  blocked: { label: "Blocked", color: "#ff6b35" },
  backlog: { label: "Backlog", color: "#888886" },
  complete: { label: "Complete", color: "#4caf50" },
};

const STATUS_ORDER: TaskStatus[] = [
  "in_progress",
  "blocked",
  "backlog",
  "complete",
];

export default async function PortalTasksPage() {
  const session = await getPortalSession();
  if (!session) redirect("/portal/login");

  const tasks = await getTasks({
    client_id: session.client_id,
    parent_only: true,
  });

  // Group tasks by status
  const grouped: Record<TaskStatus, Task[]> = {
    in_progress: [],
    blocked: [],
    backlog: [],
    complete: [],
  };

  for (const task of tasks) {
    if (task.status in grouped) {
      grouped[task.status].push(task);
    }
  }

  // Fetch subtask info for all tasks
  const subtaskInfo: Record<string, { count: number; completed: number }> = {};
  await Promise.all(
    tasks.map(async (task) => {
      const subtasks = await getSubtasks(task.id);
      subtaskInfo[task.id] = {
        count: subtasks.length,
        completed: subtasks.filter((s) => s.status === "complete").length,
      };
    })
  );

  if (tasks.length === 0) {
    return (
      <div>
        <h1
          style={{
            fontSize: "20px",
            fontFamily: "var(--font-mono)",
            color: "#111110",
            fontWeight: 400,
            margin: "0 0 24px 0",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          Tasks
        </h1>
        <p style={{ color: "#888886", fontSize: "14px" }}>No tasks yet.</p>
      </div>
    );
  }

  function toCardTask(task: Task) {
    const info = subtaskInfo[task.id] || { count: 0, completed: 0 };
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
      created_at: task.created_at,
      completed_at: task.completed_at,
      subtask_count: info.count,
      subtasks_completed: info.completed,
    };
  }

  return (
    <div>
      <h1
        style={{
          fontSize: "20px",
          fontFamily: "var(--font-mono)",
          color: "#111110",
          fontWeight: 400,
          margin: "0 0 24px 0",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        Tasks
      </h1>

      {STATUS_ORDER.map((status) => {
        const statusTasks = grouped[status];
        if (statusTasks.length === 0) return null;

        const config = STATUS_CONFIG[status];

        if (status === "complete") {
          return (
            <CompletedSection
              key={status}
              count={statusTasks.length}
              color={config.color}
            >
              {statusTasks.map((task) => (
                <TaskCard key={task.id} task={toCardTask(task)} />
              ))}
            </CompletedSection>
          );
        }

        return (
          <section key={status} style={{ marginBottom: "32px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginBottom: "12px",
              }}
            >
              <span
                style={{
                  fontSize: "14px",
                  fontFamily: "var(--font-mono)",
                  textTransform: "uppercase",
                  color: config.color,
                  letterSpacing: "0.04em",
                }}
              >
                {config.label}
              </span>
              <span
                style={{
                  fontSize: "11px",
                  fontFamily: "var(--font-mono)",
                  color: config.color,
                  backgroundColor: `${config.color}18`,
                  padding: "2px 8px",
                  borderRadius: "10px",
                  fontWeight: 600,
                }}
              >
                {statusTasks.length}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
              {statusTasks.map((task) => (
                <TaskCard key={task.id} task={toCardTask(task)} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

import { createServerClient } from "@/lib/supabase/server";
import type {
  Task,
  TaskWithClient,
  TaskComment,
  TaskStatusHistory,
  TaskStatus,
} from "@/lib/types/client-tasks";

export async function createTask(data: {
  client_id: string;
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: string;
  tags?: string[];
  due_date?: string;
  time_estimate_minutes?: number;
  parent_task_id?: string;
}): Promise<Task> {
  const supabase = createServerClient();

  const { data: task, error } = await supabase
    .from("tasks")
    .insert({
      client_id: data.client_id,
      title: data.title,
      description: data.description || null,
      status: data.status || "backlog",
      priority: data.priority || "medium",
      tags: data.tags || [],
      due_date: data.due_date || null,
      time_estimate_minutes: data.time_estimate_minutes || null,
      parent_task_id: data.parent_task_id || null,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create task: ${error.message}`);

  // Record initial status in history
  await supabase.from("task_status_history").insert({
    task_id: (task as Task).id,
    old_status: null,
    new_status: data.status || "backlog",
    changed_by: "admin",
  });

  return task as Task;
}

export async function getTasks(filters?: {
  client_id?: string;
  status?: TaskStatus;
  parent_only?: boolean;
}): Promise<Task[]> {
  const supabase = createServerClient();

  let query = supabase
    .from("tasks")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (filters?.client_id) query = query.eq("client_id", filters.client_id);
  if (filters?.status) query = query.eq("status", filters.status);
  if (filters?.parent_only) query = query.is("parent_task_id", null);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch tasks: ${error.message}`);
  return (data || []) as Task[];
}

export async function getTasksWithClients(filters?: {
  status?: TaskStatus;
  client_id?: string;
}): Promise<TaskWithClient[]> {
  const supabase = createServerClient();

  let query = supabase
    .from("tasks")
    .select(
      "*, client:clients(id, first_name, last_name, company_name, email)"
    )
    .is("parent_task_id", null)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (filters?.status) query = query.eq("status", filters.status);
  if (filters?.client_id) query = query.eq("client_id", filters.client_id);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch tasks: ${error.message}`);
  return (data || []) as TaskWithClient[];
}

export async function getTaskById(id: string): Promise<Task | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return null;
  return data as Task;
}

export async function getSubtasks(parentId: string): Promise<Task[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("parent_task_id", parentId)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(`Failed to fetch subtasks: ${error.message}`);
  return (data || []) as Task[];
}

export async function updateTask(
  id: string,
  data: Partial<Omit<Task, "id" | "created_at" | "client_id">>
): Promise<Task> {
  const supabase = createServerClient();
  const updateData: Record<string, unknown> = {
    ...data,
    updated_at: new Date().toISOString(),
  };

  if (data.status === "complete") {
    updateData.completed_at = new Date().toISOString();
  }

  const { data: task, error } = await supabase
    .from("tasks")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(`Failed to update task: ${error.message}`);
  return task as Task;
}

export async function updateTaskStatus(
  id: string,
  newStatus: TaskStatus,
  notes?: string,
  changedBy: string = "admin"
): Promise<Task> {
  const supabase = createServerClient();

  const current = await getTaskById(id);
  if (!current) throw new Error("Task not found");

  const task = await updateTask(id, { status: newStatus });

  await supabase.from("task_status_history").insert({
    task_id: id,
    old_status: current.status,
    new_status: newStatus,
    notes: notes || null,
    changed_by: changedBy,
  });

  return task;
}

export async function deleteTask(id: string): Promise<void> {
  const supabase = createServerClient();
  const { error } = await supabase.from("tasks").delete().eq("id", id);

  if (error) throw new Error(`Failed to delete task: ${error.message}`);
}

// Comments
export async function getTaskComments(
  taskId: string
): Promise<TaskComment[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("task_comments")
    .select("*")
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Failed to fetch comments: ${error.message}`);
  return (data || []) as TaskComment[];
}

export async function addTaskComment(data: {
  task_id: string;
  author_type: "admin" | "client" | "system";
  author_name: string;
  content: string;
  is_request?: boolean;
}): Promise<TaskComment> {
  const supabase = createServerClient();
  const { data: comment, error } = await supabase
    .from("task_comments")
    .insert({
      ...data,
      is_request: data.is_request || false,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to add comment: ${error.message}`);
  return comment as TaskComment;
}

// Status history
export async function getTaskStatusHistory(
  taskId: string
): Promise<TaskStatusHistory[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("task_status_history")
    .select("*")
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });

  if (error)
    throw new Error(`Failed to fetch status history: ${error.message}`);
  return (data || []) as TaskStatusHistory[];
}

// AI Velocity
export async function logTaskCompletion(task: Task): Promise<void> {
  const supabase = createServerClient();
  await supabase.from("ai_velocity_log").insert({
    task_id: task.id,
    tags: task.tags,
    time_estimate_minutes: task.time_estimate_minutes,
    time_tracked_minutes: task.time_tracked_minutes,
    complexity_score: task.complexity_score,
    completed_at: new Date().toISOString(),
  });
}

// Task counts per client
export async function getClientTaskCounts(
  clientId: string
): Promise<Record<TaskStatus, number>> {
  const supabase = createServerClient();
  const counts: Record<TaskStatus, number> = {
    backlog: 0,
    in_progress: 0,
    blocked: 0,
    complete: 0,
  };

  const { data, error } = await supabase
    .from("tasks")
    .select("status")
    .eq("client_id", clientId)
    .is("parent_task_id", null);

  if (error || !data) return counts;

  for (const task of data) {
    const s = task.status as TaskStatus;
    if (s in counts) counts[s]++;
  }

  return counts;
}

export interface Client {
  id: string;
  first_name: string;
  last_name: string;
  company_name: string;
  phone: string | null;
  email: string;
  website_url: string | null;
  github_repo_url: string | null;
  pin_hash: string;
  pin: string | null;
  form_session_token: string | null;
  created_at: string;
  updated_at: string;
}

export type TaskStatus = "backlog" | "in_progress" | "blocked" | "complete";
export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type AuthorType = "admin" | "client" | "system";

export const TASK_STATUSES: TaskStatus[] = [
  "backlog",
  "in_progress",
  "blocked",
  "complete",
];
export const TASK_PRIORITIES: TaskPriority[] = [
  "low",
  "medium",
  "high",
  "urgent",
];

export const PREDEFINED_TAGS = [
  "Design",
  "Development",
  "Content",
  "Bug Fix",
  "SEO",
  "Hosting/DNS",
  "Maintenance",
  "Consultation",
] as const;

export interface TaskAttachment {
  name: string;
  url: string;
  type: string;
}

export interface Task {
  id: string;
  client_id: string;
  parent_task_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  tags: string[];
  due_date: string | null;
  time_estimate_minutes: number | null;
  time_tracked_minutes: number;
  estimated_completion_date: string | null;
  complexity_score: number | null;
  attachments: TaskAttachment[];
  sort_order: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface TaskWithClient extends Task {
  client: Pick<
    Client,
    "id" | "first_name" | "last_name" | "company_name" | "email"
  >;
}

export interface TaskWithSubtasks extends Task {
  subtasks: Task[];
}

export interface TaskComment {
  id: string;
  task_id: string;
  author_type: AuthorType;
  author_name: string;
  content: string;
  is_request: boolean;
  created_at: string;
}

export interface TaskStatusHistory {
  id: string;
  task_id: string;
  old_status: string | null;
  new_status: string;
  notes: string | null;
  changed_by: string;
  created_at: string;
}

export interface AiVelocityLog {
  id: string;
  task_id: string;
  tags: string[];
  time_estimate_minutes: number | null;
  time_tracked_minutes: number | null;
  complexity_score: number | null;
  completed_at: string;
}

export interface InboundProposal {
  id: string;
  source: "slack" | "email";
  source_metadata: Record<string, unknown>;
  client_id: string | null;
  proposed_task: {
    title: string;
    description: string;
    priority: TaskPriority;
    tags: string[];
  };
  proposed_response: string | null;
  status: "pending" | "approved" | "rejected" | "edited";
  created_at: string;
  resolved_at: string | null;
}

export interface PortalSession {
  client_id: string;
  email: string;
  exp: number;
}

# Client Task Management System — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a client task management system with admin panel, client portal, AI agent, and Slack/Email/Telegram integrations.

**Architecture:** Hybrid — Next.js for web UI + Trigger.dev for AI agent processing. Supabase for database. Resend for email. Claude API for AI. All new tables in Supabase with service-role access (RLS disabled, matching existing pattern).

**Tech Stack:** Next.js 16 (App Router), Supabase (PostgreSQL), Resend, Trigger.dev v3, Claude API (@anthropic-ai/sdk), Telegram Bot API, Slack Events API

**Design Doc:** `docs/plans/2026-03-10-client-task-management-design.md`

---

## Phase 1: Database Foundation

### Task 1: Create database migration for all new tables

**Files:**
- Create: `supabase/migrations/007_client_task_management.sql`

**Step 1: Write the migration SQL**

```sql
-- 007_client_task_management.sql
-- Client task management system: clients, tasks, comments, status history, AI velocity

-- ============================================================
-- CLIENTS
-- ============================================================
CREATE TABLE clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text NOT NULL,
  last_name text NOT NULL,
  company_name text NOT NULL,
  phone text,
  email text NOT NULL UNIQUE,
  website_url text,
  github_repo_url text,
  pin_hash text NOT NULL,
  form_session_token uuid REFERENCES form_sessions(token) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE INDEX idx_clients_email ON clients(email);
CREATE INDEX idx_clients_company ON clients(company_name);

-- ============================================================
-- TASKS
-- ============================================================
CREATE TABLE tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  parent_task_id uuid REFERENCES tasks(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'backlog'
    CHECK (status IN ('backlog', 'in_progress', 'blocked', 'complete')),
  priority text NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  tags text[] DEFAULT '{}',
  due_date date,
  time_estimate_minutes integer,
  time_tracked_minutes integer DEFAULT 0,
  estimated_completion_date date,
  complexity_score integer CHECK (complexity_score BETWEEN 1 AND 5),
  attachments jsonb DEFAULT '[]',
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  completed_at timestamp with time zone
);

CREATE INDEX idx_tasks_client ON tasks(client_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_parent ON tasks(parent_task_id);
CREATE INDEX idx_tasks_client_status ON tasks(client_id, status);

-- ============================================================
-- TASK COMMENTS
-- ============================================================
CREATE TABLE task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_type text NOT NULL CHECK (author_type IN ('admin', 'client', 'system')),
  author_name text NOT NULL,
  content text NOT NULL,
  is_request boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX idx_comments_task ON task_comments(task_id);

-- ============================================================
-- TASK STATUS HISTORY
-- ============================================================
CREATE TABLE task_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  old_status text,
  new_status text NOT NULL,
  notes text,
  changed_by text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX idx_status_history_task ON task_status_history(task_id);

-- ============================================================
-- AI VELOCITY LOG
-- ============================================================
CREATE TABLE ai_velocity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  tags text[] DEFAULT '{}',
  time_estimate_minutes integer,
  time_tracked_minutes integer,
  complexity_score integer CHECK (complexity_score BETWEEN 1 AND 5),
  completed_at timestamp with time zone DEFAULT now()
);

CREATE INDEX idx_velocity_task ON ai_velocity_log(task_id);
CREATE INDEX idx_velocity_completed ON ai_velocity_log(completed_at);

-- ============================================================
-- TELEGRAM CONVERSATION CONTEXT
-- ============================================================
CREATE TABLE telegram_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX idx_telegram_chat ON telegram_conversations(chat_id, created_at DESC);

-- ============================================================
-- INBOUND PROPOSALS (pending approval via Telegram)
-- ============================================================
CREATE TABLE inbound_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('slack', 'email')),
  source_metadata jsonb DEFAULT '{}',
  client_id uuid REFERENCES clients(id),
  proposed_task jsonb NOT NULL,
  proposed_response text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'edited')),
  created_at timestamp with time zone DEFAULT now(),
  resolved_at timestamp with time zone
);

CREATE INDEX idx_proposals_status ON inbound_proposals(status);

-- ============================================================
-- PIN LOGIN RATE LIMITING
-- ============================================================
CREATE TABLE pin_login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX idx_pin_attempts_email ON pin_login_attempts(email, created_at DESC);
```

**Step 2: Apply the migration**

Run: `npx supabase db push` (or apply via Supabase dashboard SQL editor)
Expected: All tables created successfully

**Step 3: Commit**

```bash
git add supabase/migrations/007_client_task_management.sql
git commit -m "feat: add database migration for client task management system"
```

---

### Task 2: Create TypeScript type definitions

**Files:**
- Create: `lib/types/client-tasks.ts`

**Step 1: Write the types**

```typescript
// lib/types/client-tasks.ts

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
  form_session_token: string | null;
  created_at: string;
  updated_at: string;
}

export type TaskStatus = "backlog" | "in_progress" | "blocked" | "complete";
export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type AuthorType = "admin" | "client" | "system";

export const TASK_STATUSES: TaskStatus[] = ["backlog", "in_progress", "blocked", "complete"];
export const TASK_PRIORITIES: TaskPriority[] = ["low", "medium", "high", "urgent"];

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
  client: Pick<Client, "id" | "first_name" | "last_name" | "company_name" | "email">;
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

// Client portal session (JWT payload)
export interface PortalSession {
  client_id: string;
  email: string;
  exp: number;
}
```

**Step 2: Commit**

```bash
git add lib/types/client-tasks.ts
git commit -m "feat: add TypeScript types for client task management"
```

---

## Phase 2: Core Library Functions

### Task 3: PIN generation and hashing utilities

**Files:**
- Create: `lib/pin.ts`

**Step 1: Write PIN utilities**

```typescript
// lib/pin.ts
import { createHash, randomInt } from "crypto";

export function generatePin(): string {
  return String(randomInt(100000, 999999));
}

export function hashPin(pin: string): string {
  return createHash("sha256").update(pin).digest("hex");
}

export function verifyPin(pin: string, hash: string): boolean {
  return hashPin(pin) === hash;
}

export function maskPin(): string {
  return "••••••";
}
```

**Step 2: Commit**

```bash
git add lib/pin.ts
git commit -m "feat: add PIN generation and hashing utilities"
```

---

### Task 4: Client CRUD library functions

**Files:**
- Create: `lib/clients.ts`

**Step 1: Write client operations**

```typescript
// lib/clients.ts
import { createServerClient } from "@/lib/supabase/server";
import { generatePin, hashPin } from "@/lib/pin";
import type { Client } from "@/lib/types/client-tasks";

const supabase = createServerClient();

export async function createClient(data: {
  first_name: string;
  last_name: string;
  company_name: string;
  phone?: string;
  email: string;
  website_url?: string;
  github_repo_url?: string;
  form_session_token?: string;
}): Promise<{ client: Client; pin: string }> {
  const pin = generatePin();
  const pin_hash = hashPin(pin);

  const { data: client, error } = await supabase
    .from("clients")
    .insert({
      ...data,
      pin_hash,
      phone: data.phone || null,
      website_url: data.website_url || null,
      github_repo_url: data.github_repo_url || null,
      form_session_token: data.form_session_token || null,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create client: ${error.message}`);
  return { client: client as Client, pin };
}

export async function getClients(): Promise<Client[]> {
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to fetch clients: ${error.message}`);
  return (data || []) as Client[];
}

export async function getClientById(id: string): Promise<Client | null> {
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return null;
  return data as Client;
}

export async function getClientByEmail(email: string): Promise<Client | null> {
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("email", email.toLowerCase())
    .single();

  if (error) return null;
  return data as Client;
}

export async function updateClient(
  id: string,
  data: Partial<Omit<Client, "id" | "created_at" | "pin_hash">>
): Promise<Client> {
  const { data: client, error } = await supabase
    .from("clients")
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(`Failed to update client: ${error.message}`);
  return client as Client;
}

export async function resetClientPin(id: string): Promise<string> {
  const pin = generatePin();
  const pin_hash = hashPin(pin);

  const { error } = await supabase
    .from("clients")
    .update({ pin_hash, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error(`Failed to reset PIN: ${error.message}`);
  return pin;
}

export async function deleteClient(id: string): Promise<void> {
  const { error } = await supabase
    .from("clients")
    .delete()
    .eq("id", id);

  if (error) throw new Error(`Failed to delete client: ${error.message}`);
}
```

**Step 2: Commit**

```bash
git add lib/clients.ts
git commit -m "feat: add client CRUD library functions"
```

---

### Task 5: Task CRUD library functions

**Files:**
- Create: `lib/tasks.ts`

**Step 1: Write task operations**

```typescript
// lib/tasks.ts
import { createServerClient } from "@/lib/supabase/server";
import type { Task, TaskWithClient, TaskComment, TaskStatusHistory, TaskStatus } from "@/lib/types/client-tasks";

const supabase = createServerClient();

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
  let query = supabase
    .from("tasks")
    .select("*, client:clients(id, first_name, last_name, company_name, email)")
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
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return null;
  return data as Task;
}

export async function getSubtasks(parentId: string): Promise<Task[]> {
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
  const updateData: Record<string, unknown> = {
    ...data,
    updated_at: new Date().toISOString(),
  };

  // If status is changing to complete, set completed_at
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
  // Get current status
  const current = await getTaskById(id);
  if (!current) throw new Error("Task not found");

  const task = await updateTask(id, { status: newStatus });

  // Record status change
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
  const { error } = await supabase
    .from("tasks")
    .delete()
    .eq("id", id);

  if (error) throw new Error(`Failed to delete task: ${error.message}`);
}

// Comments
export async function getTaskComments(taskId: string): Promise<TaskComment[]> {
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
export async function getTaskStatusHistory(taskId: string): Promise<TaskStatusHistory[]> {
  const { data, error } = await supabase
    .from("task_status_history")
    .select("*")
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Failed to fetch status history: ${error.message}`);
  return (data || []) as TaskStatusHistory[];
}

// AI Velocity
export async function logTaskCompletion(task: Task): Promise<void> {
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
export async function getClientTaskCounts(clientId: string): Promise<Record<TaskStatus, number>> {
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
```

**Step 2: Commit**

```bash
git add lib/tasks.ts
git commit -m "feat: add task CRUD library functions"
```

---

### Task 6: Portal authentication (JWT-based PIN login)

**Files:**
- Create: `lib/portal-auth.ts`

**Step 1: Write portal auth utilities**

```typescript
// lib/portal-auth.ts
import { createServerClient } from "@/lib/supabase/server";
import { verifyPin } from "@/lib/pin";
import type { PortalSession } from "@/lib/types/client-tasks";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const PORTAL_COOKIE = "portal_session";
const JWT_SECRET = () => process.env.PORTAL_JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Simple JWT implementation (no external dependency needed)
function base64url(str: string): string {
  return Buffer.from(str).toString("base64url");
}

function createJwt(payload: PortalSession): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify(payload));
  const { createHmac } = require("crypto");
  const signature = createHmac("sha256", JWT_SECRET())
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${signature}`;
}

function verifyJwt(token: string): PortalSession | null {
  try {
    const [header, body, signature] = token.split(".");
    const { createHmac } = require("crypto");
    const expected = createHmac("sha256", JWT_SECRET())
      .update(`${header}.${body}`)
      .digest("base64url");
    if (signature !== expected) return null;

    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as PortalSession;
    if (payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

// Rate limiting for PIN attempts
async function checkPinRateLimit(email: string): Promise<boolean> {
  const supabase = createServerClient();
  const windowStart = new Date(Date.now() - 15 * 60 * 1000).toISOString(); // 15 minutes

  const { count, error } = await supabase
    .from("pin_login_attempts")
    .select("*", { count: "exact", head: true })
    .eq("email", email.toLowerCase())
    .gte("created_at", windowStart);

  if (error) return true; // fail-open
  return (count ?? 0) < 5;
}

async function recordPinAttempt(email: string): Promise<void> {
  const supabase = createServerClient();
  await supabase.from("pin_login_attempts").insert({ email: email.toLowerCase() });
}

export async function authenticateClient(
  email: string,
  pin: string
): Promise<{ token: string } | { error: string; status: number }> {
  // Rate limit check
  if (!(await checkPinRateLimit(email))) {
    return { error: "Too many attempts. Try again in 15 minutes.", status: 429 };
  }

  await recordPinAttempt(email);

  const supabase = createServerClient();
  const { data: client, error } = await supabase
    .from("clients")
    .select("id, email, pin_hash")
    .eq("email", email.toLowerCase())
    .single();

  if (error || !client) {
    return { error: "Invalid email or PIN", status: 401 };
  }

  if (!verifyPin(pin, client.pin_hash)) {
    return { error: "Invalid email or PIN", status: 401 };
  }

  // Create JWT (30-day expiry)
  const payload: PortalSession = {
    client_id: client.id,
    email: client.email,
    exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
  };

  return { token: createJwt(payload) };
}

export async function getPortalSession(): Promise<PortalSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(PORTAL_COOKIE)?.value;
  if (!token) return null;
  return verifyJwt(token);
}

export async function requirePortalAuth(): Promise<
  | { session: PortalSession; error?: never }
  | { session?: never; error: NextResponse }
> {
  const session = await getPortalSession();
  if (!session) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { session };
}

export { PORTAL_COOKIE };
```

**Step 2: Commit**

```bash
git add lib/portal-auth.ts
git commit -m "feat: add portal JWT authentication with PIN verification"
```

---

## Phase 3: Email Notifications

### Task 7: Task notification email templates and sender

**Files:**
- Create: `lib/task-emails.ts`

**Step 1: Write email notification functions**

```typescript
// lib/task-emails.ts
import { Resend } from "resend";
import type { Client, Task, TaskStatus } from "@/lib/types/client-tasks";

const FROM = "Website Reveals <tasks@websitereveals.com>";
const BASE_URL = () => process.env.NEXT_PUBLIC_BASE_URL || "https://websitereveals.com";

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function emailWrapper(content: string): string {
  return `
    <div style="font-family: Georgia, 'Times New Roman', serif; max-width: 600px; margin: 0 auto; background: #111110; color: #e8e6df; padding: 40px;">
      <div style="border-bottom: 1px solid #333; padding-bottom: 20px; margin-bottom: 30px;">
        <h1 style="font-size: 18px; font-weight: 400; color: #ff3d00; margin: 0; letter-spacing: 0.05em;">WEBSITE REVEALS</h1>
      </div>
      ${content}
      <div style="border-top: 1px solid #333; padding-top: 20px; margin-top: 30px; font-size: 12px; color: #888886;">
        <p>You're receiving this because you have an active project with Website Reveals.</p>
      </div>
    </div>
  `;
}

function portalButton(text: string): string {
  return `
    <a href="${BASE_URL()}/portal" style="display: inline-block; background: #ff3d00; color: #fff; padding: 12px 24px; text-decoration: none; font-size: 14px; font-weight: 600; border-radius: 4px; margin-top: 16px;">
      ${text}
    </a>
  `;
}

// Welcome email with PIN
export async function sendWelcomeEmail(client: Client, pin: string): Promise<void> {
  const resend = getResend();
  await resend.emails.send({
    from: FROM,
    to: client.email,
    subject: `Welcome to Website Reveals — ${escapeHtml(client.company_name)}`,
    html: emailWrapper(`
      <h2 style="font-size: 22px; font-weight: 400; margin-bottom: 8px;">Welcome, ${escapeHtml(client.first_name)}.</h2>
      <p style="color: #888886; font-size: 15px; line-height: 1.6;">
        Your project portal is ready. You can track task progress, leave comments, and submit requests.
      </p>
      <div style="background: #1a1a19; border: 1px solid #333; border-radius: 4px; padding: 20px; margin: 24px 0;">
        <p style="font-size: 12px; color: #888886; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px;">Your Login PIN</p>
        <p style="font-size: 28px; font-weight: 700; color: #ff3d00; letter-spacing: 0.2em; font-family: monospace; margin: 0;">${pin}</p>
        <p style="font-size: 12px; color: #888886; margin-top: 8px;">Use this with your email (${escapeHtml(client.email)}) to log in.</p>
      </div>
      ${portalButton("Go to Portal")}
    `),
  });
}

// PIN reset email
export async function sendPinResetEmail(client: Client, pin: string): Promise<void> {
  const resend = getResend();
  await resend.emails.send({
    from: FROM,
    to: client.email,
    subject: "[Website Reveals] Your PIN has been reset",
    html: emailWrapper(`
      <h2 style="font-size: 22px; font-weight: 400; margin-bottom: 8px;">PIN Reset</h2>
      <p style="color: #888886; font-size: 15px;">Your portal PIN has been reset. Use your new PIN to log in.</p>
      <div style="background: #1a1a19; border: 1px solid #333; border-radius: 4px; padding: 20px; margin: 24px 0;">
        <p style="font-size: 12px; color: #888886; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px;">New PIN</p>
        <p style="font-size: 28px; font-weight: 700; color: #ff3d00; letter-spacing: 0.2em; font-family: monospace; margin: 0;">${pin}</p>
      </div>
      ${portalButton("Go to Portal")}
    `),
  });
}

// Task created notification
export async function sendTaskCreatedEmail(client: Client, task: Task): Promise<void> {
  const resend = getResend();
  await resend.emails.send({
    from: FROM,
    to: client.email,
    subject: `[Website Reveals] New Task: ${escapeHtml(task.title)}`,
    html: emailWrapper(`
      <h2 style="font-size: 22px; font-weight: 400; margin-bottom: 8px;">New Task Added</h2>
      <p style="color: #888886; font-size: 15px;">A new task has been added to your project.</p>
      <div style="background: #1a1a19; border: 1px solid #333; border-radius: 4px; padding: 20px; margin: 24px 0;">
        <h3 style="font-size: 16px; margin: 0 0 8px;">${escapeHtml(task.title)}</h3>
        ${task.description ? `<p style="color: #888886; font-size: 14px; margin: 0 0 12px;">${escapeHtml(task.description)}</p>` : ""}
        <div style="font-size: 12px; color: #888886;">
          <span style="text-transform: uppercase; letter-spacing: 0.05em;">Priority:</span> <span style="color: #e8e6df;">${task.priority}</span>
          ${task.due_date ? ` &nbsp;|&nbsp; <span style="text-transform: uppercase; letter-spacing: 0.05em;">Due:</span> <span style="color: #e8e6df;">${task.due_date}</span>` : ""}
        </div>
      </div>
      ${portalButton("View in Portal")}
    `),
  });
}

// Status change notification
const STATUS_MESSAGES: Record<TaskStatus, { heading: string; message: string }> = {
  backlog: { heading: "Task Queued", message: "This task has been added to the backlog." },
  in_progress: { heading: "Work Started", message: "Work has begun on this task." },
  blocked: { heading: "Action Needed", message: "This task is blocked and we need something from you." },
  complete: { heading: "Task Complete", message: "This task has been completed." },
};

export async function sendStatusChangeEmail(
  client: Client,
  task: Task,
  newStatus: TaskStatus,
  notes?: string
): Promise<void> {
  const resend = getResend();
  const statusInfo = STATUS_MESSAGES[newStatus];

  const statusColor = newStatus === "blocked" ? "#ff6b35" : newStatus === "complete" ? "#4caf50" : "#ff3d00";

  await resend.emails.send({
    from: FROM,
    to: client.email,
    subject: `[Website Reveals] ${statusInfo.heading}: ${escapeHtml(task.title)}`,
    html: emailWrapper(`
      <h2 style="font-size: 22px; font-weight: 400; margin-bottom: 8px;">${statusInfo.heading}</h2>
      <p style="color: #888886; font-size: 15px;">${statusInfo.message}</p>
      <div style="background: #1a1a19; border: 1px solid #333; border-radius: 4px; padding: 20px; margin: 24px 0;">
        <h3 style="font-size: 16px; margin: 0 0 8px;">${escapeHtml(task.title)}</h3>
        <span style="display: inline-block; background: ${statusColor}; color: #fff; padding: 2px 10px; border-radius: 3px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700;">
          ${newStatus.replace("_", " ")}
        </span>
        ${notes ? `<div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #333;"><p style="font-size: 13px; color: #888886; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Notes</p><p style="font-size: 14px; color: #e8e6df; line-height: 1.5;">${escapeHtml(notes)}</p></div>` : ""}
      </div>
      ${portalButton("View in Portal")}
    `),
  });
}

// Comment notification to client
export async function sendCommentNotificationEmail(
  client: Client,
  task: Task,
  commentContent: string
): Promise<void> {
  const resend = getResend();
  await resend.emails.send({
    from: FROM,
    to: client.email,
    subject: `[Website Reveals] New update on: ${escapeHtml(task.title)}`,
    html: emailWrapper(`
      <h2 style="font-size: 22px; font-weight: 400; margin-bottom: 8px;">New Update</h2>
      <p style="color: #888886; font-size: 15px;">There's a new comment on your task.</p>
      <div style="background: #1a1a19; border: 1px solid #333; border-radius: 4px; padding: 20px; margin: 24px 0;">
        <h3 style="font-size: 16px; margin: 0 0 12px;">${escapeHtml(task.title)}</h3>
        <p style="font-size: 14px; color: #e8e6df; line-height: 1.5; border-left: 3px solid #ff3d00; padding-left: 12px;">
          ${escapeHtml(commentContent)}
        </p>
      </div>
      ${portalButton("View & Reply")}
    `),
  });
}

// Client comment/request notification to admin
export async function sendClientRequestNotification(
  client: Client,
  task: Task,
  commentContent: string
): Promise<void> {
  const resend = getResend();
  const adminEmail = process.env.AGENCY_EMAIL;
  if (!adminEmail) return;

  await resend.emails.send({
    from: FROM,
    to: adminEmail,
    subject: `[Client Request] ${escapeHtml(client.company_name)}: ${escapeHtml(task.title)}`,
    html: emailWrapper(`
      <h2 style="font-size: 22px; font-weight: 400; margin-bottom: 8px;">Client Comment</h2>
      <p style="color: #888886; font-size: 15px;">
        <strong>${escapeHtml(client.first_name)} ${escapeHtml(client.last_name)}</strong> (${escapeHtml(client.company_name)}) commented on a task.
      </p>
      <div style="background: #1a1a19; border: 1px solid #333; border-radius: 4px; padding: 20px; margin: 24px 0;">
        <h3 style="font-size: 16px; margin: 0 0 12px;">${escapeHtml(task.title)}</h3>
        <p style="font-size: 14px; color: #e8e6df; line-height: 1.5; border-left: 3px solid #ff3d00; padding-left: 12px;">
          ${escapeHtml(commentContent)}
        </p>
      </div>
      <a href="${BASE_URL()}/admin/tasks?task=${task.id}" style="display: inline-block; background: #ff3d00; color: #fff; padding: 12px 24px; text-decoration: none; font-size: 14px; font-weight: 600; border-radius: 4px; margin-top: 16px;">
        View in Admin
      </a>
    `),
  });
}
```

**Step 2: Commit**

```bash
git add lib/task-emails.ts
git commit -m "feat: add task notification email templates and sender functions"
```

---

## Phase 4: Admin API Routes

### Task 8: Client management API routes

**Files:**
- Create: `app/api/admin/clients/route.ts`
- Create: `app/api/admin/clients/[id]/route.ts`
- Create: `app/api/admin/clients/[id]/reset-pin/route.ts`

**Step 1: Write clients list/create route**

```typescript
// app/api/admin/clients/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getClients, createClient } from "@/lib/clients";
import { sendWelcomeEmail } from "@/lib/task-emails";
import { getClientByEmail } from "@/lib/clients";

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  try {
    const clients = await getClients();
    return NextResponse.json({ clients });
  } catch (err) {
    console.error("[admin/clients] GET error:", err);
    return NextResponse.json({ error: "Failed to fetch clients" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  try {
    const body = await req.json();
    const { first_name, last_name, company_name, email, phone, website_url, github_repo_url } = body;

    if (!first_name || !last_name || !company_name || !email) {
      return NextResponse.json(
        { error: "first_name, last_name, company_name, and email are required" },
        { status: 400 }
      );
    }

    // Check for existing client
    const existing = await getClientByEmail(email);
    if (existing) {
      return NextResponse.json({ error: "A client with this email already exists" }, { status: 409 });
    }

    const { client, pin } = await createClient({
      first_name,
      last_name,
      company_name,
      email: email.toLowerCase(),
      phone,
      website_url,
      github_repo_url,
    });

    // Send welcome email with PIN
    try {
      await sendWelcomeEmail(client, pin);
    } catch (emailErr) {
      console.error("[admin/clients] Welcome email failed:", emailErr);
    }

    return NextResponse.json({ client, pin }, { status: 201 });
  } catch (err) {
    console.error("[admin/clients] POST error:", err);
    return NextResponse.json({ error: "Failed to create client" }, { status: 500 });
  }
}
```

**Step 2: Write single client route**

```typescript
// app/api/admin/clients/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getClientById, updateClient, deleteClient } from "@/lib/clients";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;

  try {
    const client = await getClientById(id);
    if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
    return NextResponse.json({ client });
  } catch (err) {
    console.error("[admin/clients] GET error:", err);
    return NextResponse.json({ error: "Failed to fetch client" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;

  try {
    const body = await req.json();
    const client = await updateClient(id, body);
    return NextResponse.json({ client });
  } catch (err) {
    console.error("[admin/clients] PUT error:", err);
    return NextResponse.json({ error: "Failed to update client" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;

  try {
    await deleteClient(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/clients] DELETE error:", err);
    return NextResponse.json({ error: "Failed to delete client" }, { status: 500 });
  }
}
```

**Step 3: Write PIN reset route**

```typescript
// app/api/admin/clients/[id]/reset-pin/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getClientById, resetClientPin } from "@/lib/clients";
import { sendPinResetEmail } from "@/lib/task-emails";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;

  try {
    const client = await getClientById(id);
    if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

    const pin = await resetClientPin(id);

    try {
      await sendPinResetEmail(client, pin);
    } catch (emailErr) {
      console.error("[admin/clients] PIN reset email failed:", emailErr);
    }

    return NextResponse.json({ ok: true, pin });
  } catch (err) {
    console.error("[admin/clients] PIN reset error:", err);
    return NextResponse.json({ error: "Failed to reset PIN" }, { status: 500 });
  }
}
```

**Step 4: Commit**

```bash
git add app/api/admin/clients/
git commit -m "feat: add admin client management API routes"
```

---

### Task 9: Task management API routes

**Files:**
- Create: `app/api/admin/tasks/route.ts`
- Create: `app/api/admin/tasks/[id]/route.ts`
- Create: `app/api/admin/tasks/[id]/status/route.ts`
- Create: `app/api/admin/tasks/[id]/comments/route.ts`
- Create: `app/api/admin/tasks/[id]/time/route.ts`

**Step 1: Write tasks list/create route**

```typescript
// app/api/admin/tasks/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createTask, getTasksWithClients } from "@/lib/tasks";
import { getClientById } from "@/lib/clients";
import { sendTaskCreatedEmail } from "@/lib/task-emails";
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
    return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  try {
    const body = await req.json();
    const { client_id, title } = body;

    if (!client_id || !title) {
      return NextResponse.json({ error: "client_id and title are required" }, { status: 400 });
    }

    const client = await getClientById(client_id);
    if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

    const task = await createTask(body);

    // Send notification email to client
    try {
      await sendTaskCreatedEmail(client, task);
    } catch (emailErr) {
      console.error("[admin/tasks] Task created email failed:", emailErr);
    }

    return NextResponse.json({ task }, { status: 201 });
  } catch (err) {
    console.error("[admin/tasks] POST error:", err);
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}
```

**Step 2: Write single task route**

```typescript
// app/api/admin/tasks/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getTaskById, updateTask, deleteTask, getSubtasks } from "@/lib/tasks";
import { getTaskComments, getTaskStatusHistory } from "@/lib/tasks";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;

  try {
    const task = await getTaskById(id);
    if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    const [subtasks, comments, history] = await Promise.all([
      getSubtasks(id),
      getTaskComments(id),
      getTaskStatusHistory(id),
    ]);

    return NextResponse.json({ task, subtasks, comments, history });
  } catch (err) {
    console.error("[admin/tasks] GET error:", err);
    return NextResponse.json({ error: "Failed to fetch task" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;

  try {
    const body = await req.json();
    const task = await updateTask(id, body);
    return NextResponse.json({ task });
  } catch (err) {
    console.error("[admin/tasks] PUT error:", err);
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;

  try {
    await deleteTask(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/tasks] DELETE error:", err);
    return NextResponse.json({ error: "Failed to delete task" }, { status: 500 });
  }
}
```

**Step 3: Write status update route**

```typescript
// app/api/admin/tasks/[id]/status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { updateTaskStatus, getTaskById, logTaskCompletion } from "@/lib/tasks";
import { getClientById } from "@/lib/clients";
import { sendStatusChangeEmail } from "@/lib/task-emails";
import type { TaskStatus } from "@/lib/types/client-tasks";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;

  try {
    const { status, notes } = await req.json();

    if (!status) {
      return NextResponse.json({ error: "status is required" }, { status: 400 });
    }

    const task = await updateTaskStatus(id, status as TaskStatus, notes, "admin");

    // If completed, log to velocity tracker
    if (status === "complete") {
      await logTaskCompletion(task);
    }

    // Send status change email
    const client = await getClientById(task.client_id);
    if (client) {
      try {
        await sendStatusChangeEmail(client, task, status as TaskStatus, notes);
      } catch (emailErr) {
        console.error("[admin/tasks] Status email failed:", emailErr);
      }
    }

    return NextResponse.json({ task });
  } catch (err) {
    console.error("[admin/tasks] Status update error:", err);
    return NextResponse.json({ error: "Failed to update status" }, { status: 500 });
  }
}
```

**Step 4: Write comments route**

```typescript
// app/api/admin/tasks/[id]/comments/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { addTaskComment, getTaskComments, getTaskById } from "@/lib/tasks";
import { getClientById } from "@/lib/clients";
import { sendCommentNotificationEmail } from "@/lib/task-emails";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;

  try {
    const comments = await getTaskComments(id);
    return NextResponse.json({ comments });
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch comments" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;

  try {
    const { content } = await req.json();
    if (!content) return NextResponse.json({ error: "content is required" }, { status: 400 });

    const comment = await addTaskComment({
      task_id: id,
      author_type: "admin",
      author_name: "Ben",
      content,
    });

    // Notify client
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
    return NextResponse.json({ error: "Failed to add comment" }, { status: 500 });
  }
}
```

**Step 5: Write time tracking route**

```typescript
// app/api/admin/tasks/[id]/time/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { updateTask, getTaskById } from "@/lib/tasks";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;

  try {
    const { minutes } = await req.json();
    if (typeof minutes !== "number" || minutes < 0) {
      return NextResponse.json({ error: "minutes must be a positive number" }, { status: 400 });
    }

    const current = await getTaskById(id);
    if (!current) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    const task = await updateTask(id, {
      time_tracked_minutes: current.time_tracked_minutes + minutes,
    });

    return NextResponse.json({ task });
  } catch (err) {
    return NextResponse.json({ error: "Failed to update time" }, { status: 500 });
  }
}
```

**Step 6: Commit**

```bash
git add app/api/admin/tasks/
git commit -m "feat: add admin task management API routes"
```

---

### Task 10: Portal API routes (login, tasks, comments)

**Files:**
- Create: `app/api/portal/login/route.ts`
- Create: `app/api/portal/logout/route.ts`
- Create: `app/api/portal/tasks/route.ts`
- Create: `app/api/portal/tasks/[id]/comments/route.ts`

**Step 1: Write portal login route**

```typescript
// app/api/portal/login/route.ts
import { NextRequest, NextResponse } from "next/server";
import { authenticateClient, PORTAL_COOKIE } from "@/lib/portal-auth";

export async function POST(req: NextRequest) {
  try {
    const { email, pin } = await req.json();

    if (!email || !pin) {
      return NextResponse.json({ error: "Email and PIN are required" }, { status: 400 });
    }

    const result = await authenticateClient(email, pin);

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(PORTAL_COOKIE, result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: "/",
    });

    return response;
  } catch (err) {
    console.error("[portal/login] Error:", err);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
```

**Step 2: Write portal logout route**

```typescript
// app/api/portal/logout/route.ts
import { NextResponse } from "next/server";
import { PORTAL_COOKIE } from "@/lib/portal-auth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(PORTAL_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return response;
}
```

**Step 3: Write portal tasks route**

```typescript
// app/api/portal/tasks/route.ts
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

    // Fetch subtask counts for each task
    const tasksWithSubtasks = await Promise.all(
      tasks.map(async (task) => {
        const subtasks = await getSubtasks(task.id);
        const completedSubtasks = subtasks.filter((s) => s.status === "complete").length;
        return {
          ...task,
          subtask_count: subtasks.length,
          subtasks_completed: completedSubtasks,
          // Hide internal fields from client
          time_tracked_minutes: undefined,
          time_estimate_minutes: undefined,
        };
      })
    );

    return NextResponse.json({ tasks: tasksWithSubtasks });
  } catch (err) {
    console.error("[portal/tasks] Error:", err);
    return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 });
  }
}
```

**Step 4: Write portal comments route**

```typescript
// app/api/portal/tasks/[id]/comments/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requirePortalAuth } from "@/lib/portal-auth";
import { getTaskById, getTaskComments, addTaskComment } from "@/lib/tasks";
import { getClientById } from "@/lib/clients";
import { sendClientRequestNotification } from "@/lib/task-emails";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalAuth();
  if (auth.error) return auth.error;

  const { id } = await params;

  // Verify task belongs to this client
  const task = await getTaskById(id);
  if (!task || task.client_id !== auth.session.client_id) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  try {
    const comments = await getTaskComments(id);
    return NextResponse.json({ comments });
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch comments" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalAuth();
  if (auth.error) return auth.error;

  const { id } = await params;

  // Verify task belongs to this client
  const task = await getTaskById(id);
  if (!task || task.client_id !== auth.session.client_id) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  try {
    const { content, is_request } = await req.json();
    if (!content) return NextResponse.json({ error: "content is required" }, { status: 400 });

    const client = await getClientById(auth.session.client_id);
    if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

    const comment = await addTaskComment({
      task_id: id,
      author_type: "client",
      author_name: `${client.first_name} ${client.last_name}`,
      content,
      is_request: is_request || false,
    });

    // Notify admin
    try {
      await sendClientRequestNotification(client, task, content);
    } catch (emailErr) {
      console.error("[portal/comments] Admin notification failed:", emailErr);
    }

    return NextResponse.json({ comment }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: "Failed to add comment" }, { status: 500 });
  }
}
```

**Step 5: Commit**

```bash
git add app/api/portal/
git commit -m "feat: add client portal API routes (login, tasks, comments)"
```

---

## Phase 5: Admin UI — Client Management

### Task 11: Update admin navigation to include Clients and Tasks tabs

**Files:**
- Modify: `app/admin/page.tsx`
- Create: `components/admin/AdminNav.tsx`

**Step 1: Create admin navigation component**

Create `components/admin/AdminNav.tsx` — a tabbed navigation bar that switches between Submissions, Clients, and Tasks views. Use the existing admin page styling patterns (dark background, serif fonts, monospace accents, `#ff3d00` primary color).

The nav should be a `"use client"` component that takes `activeTab` and `onTabChange` props. Tabs: "submissions", "clients", "tasks". Style to match existing admin badges (monospace, uppercase, small).

**Step 2: Modify the admin page to use tabbed navigation**

Update `app/admin/page.tsx` to:
1. Import and render `AdminNav`
2. Keep existing `SubmissionsTable` for the "submissions" tab
3. Conditionally render new `ClientsPanel` and `TasksPanel` components (created in subsequent tasks)
4. Fetch clients and tasks data alongside submissions

**Step 3: Commit**

```bash
git add components/admin/AdminNav.tsx app/admin/page.tsx
git commit -m "feat: add tabbed navigation to admin panel"
```

---

### Task 12: Build the ClientsPanel component

**Files:**
- Create: `components/admin/ClientsPanel.tsx`

**Step 1: Build the clients panel**

Create `components/admin/ClientsPanel.tsx` — a `"use client"` component that displays:

1. **Header row:** "Clients" heading + "Add Client" button
2. **Search bar:** Filter by name, company, or email (same pattern as `SubmissionsTable`)
3. **Table** with columns: Name (first + last), Company, Email, Phone, Active Tasks, Last Activity
4. **Sortable columns** (same toggle pattern as `SubmissionsTable`)
5. **Row click** opens a `ClientDetailDrawer` (created next task)

Props: `clients: Client[]`, initial data passed from server.

State management pattern should match `SubmissionsTable`: `useState` for data, `useMemo` for filtered/sorted results, client-side fetch for mutations.

When "Add Client" is clicked, show an inline modal/form with fields: first name, last name, company name, email, phone, website URL, GitHub repo URL. On submit, POST to `/api/admin/clients`. Show the returned PIN in a confirmation dialog (one-time display). Update the client list optimistically.

**Step 2: Commit**

```bash
git add components/admin/ClientsPanel.tsx
git commit -m "feat: add ClientsPanel component with search, sort, and add client"
```

---

### Task 13: Build the ClientDetailDrawer component

**Files:**
- Create: `components/admin/ClientDetailDrawer.tsx`

**Step 1: Build the client detail drawer**

Create `components/admin/ClientDetailDrawer.tsx` — same sliding drawer pattern as `DetailDrawer.tsx`. Include:

1. **Header:** Client name + company
2. **Contact section:** Email, phone, website URL, GitHub repo URL (each as a labeled row)
3. **PIN section:** Masked PIN (••••••) + "Reset PIN" button. On click, POST to `/api/admin/clients/[id]/reset-pin`. Show new PIN in a temporary alert.
4. **Form submission link:** If `form_session_token` is set, link to existing submission detail
5. **Task summary:** Counts by status (fetch from `/api/admin/tasks?client_id=X` or pass as prop). Show colored badges: backlog (gray), in_progress (blue), blocked (orange), complete (green).
6. **Quick-add task button:** Opens add task modal pre-filled with this client
7. **Edit button:** Opens edit form for client fields

Match existing `DetailDrawer` patterns: fixed overlay, escape to close, click-outside to close.

**Step 2: Commit**

```bash
git add components/admin/ClientDetailDrawer.tsx
git commit -m "feat: add ClientDetailDrawer with PIN management and task summary"
```

---

## Phase 6: Admin UI — Task Management

### Task 14: Build the TasksPanel with board and list views

**Files:**
- Create: `components/admin/TasksPanel.tsx`

**Step 1: Build tasks panel shell with view toggle**

Create `components/admin/TasksPanel.tsx` — `"use client"` component with:

1. **Header row:** "Tasks" heading + view toggle (Board | List) + "Add Task" button
2. **Filters bar:** Client dropdown, priority dropdown, tags multi-select, search by title
3. **Board view (default):** Four columns — Backlog, In Progress, Blocked, Complete
   - Each column shows task cards
   - Cards show: title, client name badge, priority badge (colored), tags, due date, subtask progress ("2/5")
   - Drag-and-drop between columns using HTML5 drag events (no external library needed for basic DnD)
   - On drop to new column: show a small modal asking for optional notes, then PUT to `/api/admin/tasks/[id]/status`
4. **List view:** Table with columns: Title, Client, Status, Priority, Tags, Due Date, Estimate, Tracked Time. Sortable.
5. **Row/card click:** Opens `TaskDetailDrawer`

Fetch tasks from `/api/admin/tasks` on mount. Refetch after mutations.

**Step 2: Commit**

```bash
git add components/admin/TasksPanel.tsx
git commit -m "feat: add TasksPanel with kanban board and list views"
```

---

### Task 15: Build the TaskDetailDrawer component

**Files:**
- Create: `components/admin/TaskDetailDrawer.tsx`

**Step 1: Build task detail drawer**

Create `components/admin/TaskDetailDrawer.tsx` — sliding drawer with full task editing:

1. **Title:** Editable inline (click to edit, blur to save)
2. **Description:** Textarea with markdown preview toggle
3. **Status dropdown:** With notes field — changing status triggers PUT to `/api/admin/tasks/[id]/status`
4. **Priority selector:** Radio buttons or dropdown (low/medium/high/urgent)
5. **Tags:** Multi-select from predefined list + text input for custom tags
6. **Client:** Read-only display with link
7. **Due date:** Date picker input
8. **Time estimate:** Number input (minutes), displayed as hours/minutes
9. **Time tracker:**
   - Display: "Tracked: 2h 30m"
   - "Add Time" button → small input for manual minute entry → POST to `/api/admin/tasks/[id]/time`
   - Start/stop timer button (tracks in local state, logs on stop)
10. **Subtasks section:**
    - List of subtasks with checkbox (toggle complete) + title
    - "Add subtask" inline input
    - Subtasks are just tasks with `parent_task_id` set — POST to `/api/admin/tasks` with `parent_task_id`
11. **Attachments section:**
    - List of attachments with download links
    - Upload button → POST file to `/api/upload` (reuse existing upload route pattern), then update task attachments array
12. **Comments section:**
    - Chronological list with author name, type badge, timestamp
    - Client comments with `is_request=true` highlighted with orange border
    - Text input + submit for new admin comment
13. **Status history:**
    - Collapsible timeline showing all status changes with notes and timestamps

Fetch full task detail from `/api/admin/tasks/[id]` on open (returns task + subtasks + comments + history).

**Step 2: Commit**

```bash
git add components/admin/TaskDetailDrawer.tsx
git commit -m "feat: add TaskDetailDrawer with full task editing capabilities"
```

---

### Task 16: Add task modal component

**Files:**
- Create: `components/admin/AddTaskModal.tsx`

**Step 1: Build add task modal**

Create `components/admin/AddTaskModal.tsx`:

1. **Client selector:** Searchable dropdown of clients (fetched from `/api/admin/clients`)
2. **Title:** Text input (required)
3. **Description:** Textarea
4. **Priority:** Dropdown (low/medium/high/urgent), default medium
5. **Tags:** Multi-select from predefined + custom input
6. **Due date:** Date picker
7. **Time estimate:** Number input (minutes)
8. **Submit:** POST to `/api/admin/tasks`, close modal, callback to parent to refresh list

Props: `onClose`, `onCreated`, optional `defaultClientId` (for quick-add from client detail).

**Step 2: Commit**

```bash
git add components/admin/AddTaskModal.tsx
git commit -m "feat: add AddTaskModal component"
```

---

## Phase 7: Client Portal UI

### Task 17: Portal login page

**Files:**
- Create: `app/portal/login/page.tsx`

**Step 1: Build portal login page**

Create `app/portal/login/page.tsx` — `"use client"` component:

1. Match admin aesthetic: dark background (#111110), serif heading, mono accents
2. Centered card with:
   - "Client Portal" heading
   - Email input
   - PIN input (6 digits, type="text" with maxLength=6, monospace font, large letter-spacing)
   - "Log In" button (styled like existing `GlowButton` — #ff3d00 background)
   - Error message display
3. On submit: POST to `/api/portal/login`
4. On success: redirect to `/portal`
5. Rate limit message display ("Too many attempts...")

**Step 2: Commit**

```bash
git add app/portal/login/page.tsx
git commit -m "feat: add client portal login page"
```

---

### Task 18: Portal layout and middleware

**Files:**
- Create: `app/portal/layout.tsx`
- Modify: `middleware.ts`

**Step 1: Create portal layout**

Create `app/portal/layout.tsx`:
- Dark theme matching admin
- Header: "Website Reveals" branding + client name + logout button
- Fetch client info from session for the header
- Navigation: Dashboard | Tasks

**Step 2: Update middleware for portal routes**

Add portal route protection to `middleware.ts`:
- Check for `portal_session` cookie on `/portal` routes (but not `/portal/login`)
- If no cookie, redirect to `/portal/login`
- Parse JWT to verify it's not expired (basic check — full verification happens in API routes)

Update the matcher:
```typescript
export const config = {
  matcher: ["/admin/:path*", "/portal/:path*"],
};
```

**Step 3: Commit**

```bash
git add app/portal/layout.tsx middleware.ts
git commit -m "feat: add portal layout and middleware protection"
```

---

### Task 19: Portal dashboard page

**Files:**
- Create: `app/portal/page.tsx`

**Step 1: Build portal dashboard**

Create `app/portal/page.tsx`:

1. **Welcome header:** "Welcome, [First Name]" + company name
2. **Summary cards row:** Four cards showing task counts by status
   - Each card: status label + count + colored accent (backlog=gray, in_progress=blue, blocked=orange, complete=green)
3. **AI estimate banner:** "Based on current workload, your active tasks are estimated to complete by [date]"
   - Fetch estimated completion from tasks data
   - If no active tasks: "No active tasks"
4. **Recent activity:** Last 5 comments or status changes across all tasks

Server component that fetches data from Supabase directly (using service role, scoped to `client_id` from session).

**Step 2: Commit**

```bash
git add app/portal/page.tsx
git commit -m "feat: add client portal dashboard"
```

---

### Task 20: Portal tasks page with inline detail

**Files:**
- Create: `app/portal/tasks/page.tsx`
- Create: `components/portal/TaskCard.tsx`

**Step 1: Build portal tasks page**

Create `app/portal/tasks/page.tsx` — server component that fetches tasks for the authenticated client. Groups tasks by status: In Progress → Blocked → Backlog → Complete (collapsed by default).

Each section has a header with status name + count. Tasks render as `TaskCard` components.

**Step 2: Build TaskCard component**

Create `components/portal/TaskCard.tsx` — `"use client"` component:

1. **Collapsed state:** Title, status badge, priority badge, tags, due date, estimated completion, subtask progress ("3/5")
2. **Expanded state (click to toggle):**
   - Description (read-only)
   - Subtask list with checkmarks (read-only)
   - Attachments with download links
   - Comments section (scrollable list + input to post new comment)
   - "Submit Request" button that posts a comment with `is_request: true`
3. POST comments to `/api/portal/tasks/[id]/comments`
4. Animations: smooth expand/collapse using CSS transitions or framer-motion (already in deps)

**Step 3: Commit**

```bash
git add app/portal/tasks/page.tsx components/portal/TaskCard.tsx
git commit -m "feat: add client portal tasks page with inline detail"
```

---

## Phase 8: Auto-Create Clients from Form Submissions

### Task 21: Hook into form submission to auto-create clients

**Files:**
- Modify: `app/api/form/[token]/submit/route.ts`
- Modify: `app/api/webhooks/submit/route.ts`

**Step 1: Add client auto-creation to form submit**

In `app/api/form/[token]/submit/route.ts`, after the session is marked as submitted and before emails are sent:

```typescript
import { getClientByEmail, createClient } from "@/lib/clients";
import { sendWelcomeEmail } from "@/lib/task-emails";

// After session submission...
const email = (formData.contact_email || formData.email || session.email) as string;
if (email) {
  try {
    const existingClient = await getClientByEmail(email);
    if (!existingClient) {
      const { client, pin } = await createClient({
        first_name: (formData.contact_name?.toString().split(" ")[0]) || "Client",
        last_name: (formData.contact_name?.toString().split(" ").slice(1).join(" ")) || "",
        company_name: (formData.business_name as string) || "Unknown",
        email,
        phone: (formData.contact_phone || formData.phone) as string,
        website_url: (formData.current_website) as string,
        form_session_token: token,
      });
      await sendWelcomeEmail(client, pin);
    } else {
      // Link form session to existing client
      await updateClient(existingClient.id, { form_session_token: token });
    }
  } catch (clientErr) {
    console.error("[submit] Client auto-creation failed:", clientErr);
  }
}
```

**Step 2: Add same logic to webhook submit route**

Same pattern in `app/api/webhooks/submit/route.ts`.

**Step 3: Commit**

```bash
git add app/api/form/[token]/submit/route.ts app/api/webhooks/submit/route.ts
git commit -m "feat: auto-create clients from form submissions"
```

---

## Phase 9: AI Agent — Trigger.dev Tasks

### Task 22: Install Anthropic SDK and create AI utilities

**Files:**
- Modify: `package.json` (via npm install)
- Create: `lib/ai-agent.ts`

**Step 1: Install Anthropic SDK**

Run: `npm install @anthropic-ai/sdk`

**Step 2: Create AI agent utility**

```typescript
// lib/ai-agent.ts
import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@/lib/supabase/server";
import type { Task, Client, AiVelocityLog } from "@/lib/types/client-tasks";

function getAnthropicClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

export async function getAgentContext(): Promise<{
  clients: Client[];
  activeTasks: Task[];
  velocityLog: AiVelocityLog[];
}> {
  const supabase = createServerClient();

  const [clientsRes, tasksRes, velocityRes] = await Promise.all([
    supabase.from("clients").select("*").order("company_name"),
    supabase.from("tasks").select("*").in("status", ["backlog", "in_progress", "blocked"]).order("created_at", { ascending: false }),
    supabase.from("ai_velocity_log").select("*").order("completed_at", { ascending: false }).limit(100),
  ]);

  return {
    clients: (clientsRes.data || []) as Client[],
    activeTasks: (tasksRes.data || []) as Task[],
    velocityLog: (velocityRes.data || []) as AiVelocityLog[],
  };
}

export async function aiEstimateTask(task: Task, context: {
  activeTasks: Task[];
  velocityLog: AiVelocityLog[];
}): Promise<{
  complexity_score: number;
  estimated_completion_date: string;
  confidence: "low" | "medium" | "high";
}> {
  const anthropic = getAnthropicClient();

  const prompt = `You are a project estimation AI for a web development agency. Analyze this task and provide an estimate.

TASK:
- Title: ${task.title}
- Description: ${task.description || "None"}
- Tags: ${task.tags.join(", ") || "None"}
- Priority: ${task.priority}
- Current estimate: ${task.time_estimate_minutes ? `${task.time_estimate_minutes} minutes` : "None"}

CURRENT QUEUE (${context.activeTasks.length} active tasks):
${context.activeTasks.map(t => `- [${t.status}] ${t.title} (${t.tags.join(", ")})`).join("\n")}

HISTORICAL VELOCITY (last ${context.velocityLog.length} completed tasks):
${context.velocityLog.map(v => `- Tags: ${v.tags.join(", ")} | Estimated: ${v.time_estimate_minutes}min | Actual: ${v.time_tracked_minutes}min | Complexity: ${v.complexity_score}/5`).join("\n")}

Respond with ONLY valid JSON:
{
  "complexity_score": <1-5>,
  "estimated_days_to_complete": <number>,
  "confidence": "low" | "medium" | "high",
  "reasoning": "<brief explanation>"
}`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 500,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const result = JSON.parse(text);

  const estimatedDate = new Date();
  estimatedDate.setDate(estimatedDate.getDate() + result.estimated_days_to_complete);

  return {
    complexity_score: result.complexity_score,
    estimated_completion_date: estimatedDate.toISOString().split("T")[0],
    confidence: result.confidence,
  };
}

export async function aiProcessInbound(message: {
  content: string;
  sender: string;
  source: "slack" | "email";
  subject?: string;
  metadata?: Record<string, unknown>;
}, context: {
  clients: Client[];
  activeTasks: Task[];
}): Promise<{
  client_match: { id: string; name: string } | null;
  proposed_task: { title: string; description: string; priority: string; tags: string[] };
  proposed_response: string;
}> {
  const anthropic = getAnthropicClient();

  const prompt = `You are an AI assistant for a web development agency. Process this inbound ${message.source} message and extract a task.

MESSAGE:
From: ${message.sender}
${message.subject ? `Subject: ${message.subject}` : ""}
Content: ${message.content}

KNOWN CLIENTS:
${context.clients.map(c => `- ${c.first_name} ${c.last_name} (${c.company_name}) — ${c.email} [ID: ${c.id}]`).join("\n")}

ACTIVE TASKS:
${context.activeTasks.map(t => `- ${t.title} (${t.status})`).join("\n")}

Respond with ONLY valid JSON:
{
  "client_match": { "id": "<client uuid or null>", "name": "<client name>" } | null,
  "proposed_task": {
    "title": "<concise task title>",
    "description": "<task description>",
    "priority": "low" | "medium" | "high" | "urgent",
    "tags": ["<relevant tags from: Design, Development, Content, Bug Fix, SEO, Hosting/DNS, Maintenance, Consultation>"]
  },
  "proposed_response": "<proposed reply to send back to the sender, acknowledging receipt and summarizing the task>"
}`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1000,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  return JSON.parse(text);
}

export async function aiProcessTelegramCommand(message: string, conversationHistory: {
  role: "user" | "assistant";
  content: string;
}[], context: {
  clients: Client[];
  activeTasks: Task[];
}): Promise<{
  intent: "create_task" | "update_task" | "delete_task" | "create_client" | "check_status" | "approve_proposal" | "reject_proposal" | "conversation";
  data: Record<string, unknown>;
  response: string;
}> {
  const anthropic = getAnthropicClient();

  const systemPrompt = `You are Ben's AI assistant for managing client tasks at Website Reveals, a web development agency. You communicate via Telegram.

You can:
- Create tasks for clients
- Update task status (backlog, in_progress, blocked, complete)
- Delete tasks (but ask for confirmation first)
- Create new clients
- Check task/client status
- Approve or reject inbound proposals (from Slack/Email)

KNOWN CLIENTS:
${context.clients.map(c => `- ${c.first_name} ${c.last_name} (${c.company_name}) — ${c.email} [ID: ${c.id}]`).join("\n")}

ACTIVE TASKS:
${context.activeTasks.map(t => `- [${t.id.slice(0, 8)}] ${t.title} — ${t.status} (Client: ${t.client_id.slice(0, 8)})`).join("\n")}

Respond with ONLY valid JSON:
{
  "intent": "<one of: create_task, update_task, delete_task, create_client, check_status, approve_proposal, reject_proposal, conversation>",
  "data": { <relevant data for the intent> },
  "response": "<conversational response to send back to Ben via Telegram>"
}

For create_task data: { "client_id": "...", "title": "...", "description": "...", "priority": "...", "tags": [...] }
For update_task data: { "task_id": "...", "status": "...", "notes": "..." }
For delete_task data: { "task_id": "...", "confirm": true/false }
For create_client data: { "first_name": "...", "last_name": "...", "company_name": "...", "email": "..." }
For check_status data: { "client_id": "..." } or {}
For approve/reject_proposal data: { "proposal_id": "..." }
For conversation data: {}`;

  const messages = [
    ...conversationHistory.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user" as const, content: message },
  ];

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1000,
    system: systemPrompt,
    messages,
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  return JSON.parse(text);
}

export { getAnthropicClient };
```

**Step 3: Commit**

```bash
git add lib/ai-agent.ts package.json package-lock.json
git commit -m "feat: add AI agent utilities with Claude API integration"
```

---

### Task 23: Create Trigger.dev AI tasks

**Files:**
- Create: `src/trigger/ai-estimate.ts`
- Create: `src/trigger/ai-process-inbound.ts`
- Create: `src/trigger/ai-telegram-command.ts`

**Step 1: Write ai-estimate task**

```typescript
// src/trigger/ai-estimate.ts
import { task } from "@trigger.dev/sdk/v3";
import { createServerClient } from "@/lib/supabase/server";
import { getAgentContext, aiEstimateTask } from "@/lib/ai-agent";
import type { Task } from "@/lib/types/client-tasks";

export const aiEstimate = task({
  id: "ai-estimate",
  maxDuration: 120, // 2 minutes
  run: async (payload: { taskId: string }) => {
    const supabase = createServerClient();

    const { data: taskData } = await supabase
      .from("tasks")
      .select("*")
      .eq("id", payload.taskId)
      .single();

    if (!taskData) throw new Error("Task not found");

    const context = await getAgentContext();
    const estimate = await aiEstimateTask(taskData as Task, context);

    // Update task with estimate
    await supabase
      .from("tasks")
      .update({
        complexity_score: estimate.complexity_score,
        estimated_completion_date: estimate.estimated_completion_date,
        updated_at: new Date().toISOString(),
      })
      .eq("id", payload.taskId);

    return estimate;
  },
});
```

**Step 2: Write ai-process-inbound task**

```typescript
// src/trigger/ai-process-inbound.ts
import { task } from "@trigger.dev/sdk/v3";
import { createServerClient } from "@/lib/supabase/server";
import { getAgentContext, aiProcessInbound } from "@/lib/ai-agent";
import { sendTelegramMessage } from "@/lib/telegram";

export const aiProcessInboundTask = task({
  id: "ai-process-inbound",
  maxDuration: 120,
  run: async (payload: {
    content: string;
    sender: string;
    source: "slack" | "email";
    subject?: string;
    metadata?: Record<string, unknown>;
  }) => {
    const context = await getAgentContext();

    const result = await aiProcessInbound({
      content: payload.content,
      sender: payload.sender,
      source: payload.source,
      subject: payload.subject,
      metadata: payload.metadata,
    }, context);

    // Store proposal
    const supabase = createServerClient();
    const { data: proposal } = await supabase
      .from("inbound_proposals")
      .insert({
        source: payload.source,
        source_metadata: payload.metadata || {},
        client_id: result.client_match?.id || null,
        proposed_task: result.proposed_task,
        proposed_response: result.proposed_response,
      })
      .select("id")
      .single();

    // Send to Telegram for approval
    const clientInfo = result.client_match
      ? `Client: ${result.client_match.name}`
      : "⚠️ Client not identified — reply with client name";

    const message = `📨 New ${payload.source} inbound from: ${payload.sender}\n\n${clientInfo}\n\n📋 Proposed Task:\n• Title: ${result.proposed_task.title}\n• Priority: ${result.proposed_task.priority}\n• Tags: ${result.proposed_task.tags.join(", ")}\n• Description: ${result.proposed_task.description}\n\n💬 Proposed Response:\n${result.proposed_response}\n\n—\nReply "approve ${proposal?.id?.slice(0, 8)}" or "reject ${proposal?.id?.slice(0, 8)}"`;

    await sendTelegramMessage(message);

    return { proposal_id: proposal?.id, result };
  },
});
```

**Step 3: Write ai-telegram-command task**

```typescript
// src/trigger/ai-telegram-command.ts
import { task } from "@trigger.dev/sdk/v3";
import { createServerClient } from "@/lib/supabase/server";
import { getAgentContext, aiProcessTelegramCommand } from "@/lib/ai-agent";
import { createTask, updateTaskStatus, deleteTask } from "@/lib/tasks";
import { createClient } from "@/lib/clients";
import { sendTelegramMessage } from "@/lib/telegram";
import { sendWelcomeEmail, sendStatusChangeEmail } from "@/lib/task-emails";
import { getClientById } from "@/lib/clients";

export const aiTelegramCommand = task({
  id: "ai-telegram-command",
  maxDuration: 120,
  run: async (payload: { message: string; chatId: string }) => {
    const supabase = createServerClient();

    // Fetch conversation history (last 10 messages)
    const { data: history } = await supabase
      .from("telegram_conversations")
      .select("role, content")
      .eq("chat_id", payload.chatId)
      .order("created_at", { ascending: false })
      .limit(10);

    const conversationHistory = (history || [])
      .reverse()
      .map(h => ({ role: h.role as "user" | "assistant", content: h.content }));

    const context = await getAgentContext();
    const result = await aiProcessTelegramCommand(payload.message, conversationHistory, context);

    // Execute the intent
    try {
      switch (result.intent) {
        case "create_task": {
          const data = result.data as { client_id: string; title: string; description?: string; priority?: string; tags?: string[] };
          const newTask = await createTask(data);
          // Send task created email
          const client = await getClientById(data.client_id);
          if (client) {
            try {
              const { sendTaskCreatedEmail } = await import("@/lib/task-emails");
              await sendTaskCreatedEmail(client, newTask);
            } catch {}
          }
          break;
        }
        case "update_task": {
          const data = result.data as { task_id: string; status: string; notes?: string };
          const updatedTask = await updateTaskStatus(data.task_id, data.status as any, data.notes, "ai-agent");
          const client = await getClientById(updatedTask.client_id);
          if (client) {
            try {
              await sendStatusChangeEmail(client, updatedTask, data.status as any, data.notes);
            } catch {}
          }
          break;
        }
        case "delete_task": {
          const data = result.data as { task_id: string; confirm?: boolean };
          if (data.confirm) {
            await deleteTask(data.task_id);
          }
          // If not confirmed, the response will ask for confirmation
          break;
        }
        case "create_client": {
          const data = result.data as { first_name: string; last_name: string; company_name: string; email: string; phone?: string };
          const { client, pin } = await createClient(data);
          await sendWelcomeEmail(client, pin);
          break;
        }
        case "approve_proposal": {
          const data = result.data as { proposal_id: string };
          // Find proposal, create task, send response
          const { data: proposal } = await supabase
            .from("inbound_proposals")
            .select("*")
            .eq("id", data.proposal_id)
            .single();

          if (proposal && proposal.client_id) {
            await createTask({
              client_id: proposal.client_id,
              ...proposal.proposed_task,
            });
            await supabase
              .from("inbound_proposals")
              .update({ status: "approved", resolved_at: new Date().toISOString() })
              .eq("id", data.proposal_id);
          }
          break;
        }
        case "reject_proposal": {
          const data = result.data as { proposal_id: string };
          await supabase
            .from("inbound_proposals")
            .update({ status: "rejected", resolved_at: new Date().toISOString() })
            .eq("id", data.proposal_id);
          break;
        }
        // check_status and conversation — no side effects, just respond
      }
    } catch (execErr) {
      console.error("[telegram] Execution error:", execErr);
      result.response += `\n\n⚠️ Error executing: ${execErr instanceof Error ? execErr.message : String(execErr)}`;
    }

    // Save conversation
    await supabase.from("telegram_conversations").insert([
      { chat_id: payload.chatId, role: "user", content: payload.message },
      { chat_id: payload.chatId, role: "assistant", content: result.response },
    ]);

    // Send response via Telegram
    await sendTelegramMessage(result.response, payload.chatId);

    return result;
  },
});
```

**Step 4: Commit**

```bash
git add src/trigger/ai-estimate.ts src/trigger/ai-process-inbound.ts src/trigger/ai-telegram-command.ts
git commit -m "feat: add Trigger.dev AI agent tasks (estimate, inbound, telegram)"
```

---

## Phase 10: Integration — Telegram

### Task 24: Telegram bot utilities and webhook

**Files:**
- Create: `lib/telegram.ts`
- Create: `app/api/integrations/telegram/webhook/route.ts`

**Step 1: Write Telegram bot utilities**

```typescript
// lib/telegram.ts
const TELEGRAM_API = "https://api.telegram.org/bot";

function getBotToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not set");
  return token;
}

function getAdminChatId(): string {
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!chatId) throw new Error("TELEGRAM_ADMIN_CHAT_ID not set");
  return chatId;
}

export async function sendTelegramMessage(text: string, chatId?: string): Promise<void> {
  const token = getBotToken();
  const targetChat = chatId || getAdminChatId();

  const res = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: targetChat,
      text,
      parse_mode: "Markdown",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("[telegram] Send failed:", err);
  }
}

export async function setTelegramWebhook(url: string): Promise<void> {
  const token = getBotToken();
  const res = await fetch(`${TELEGRAM_API}${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });

  if (!res.ok) {
    throw new Error(`Failed to set webhook: ${await res.text()}`);
  }
}

export function validateTelegramUpdate(body: Record<string, unknown>): boolean {
  // Basic validation — ensure it has message structure
  return !!(body.message && typeof body.message === "object");
}
```

**Step 2: Write Telegram webhook route**

```typescript
// app/api/integrations/telegram/webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import { validateTelegramUpdate } from "@/lib/telegram";
import { tasks } from "@trigger.dev/sdk/v3";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!validateTelegramUpdate(body)) {
      return NextResponse.json({ ok: true }); // Telegram expects 200 even on invalid
    }

    const message = body.message as Record<string, unknown>;
    const text = message.text as string;
    const chatId = String((message.chat as Record<string, unknown>).id);

    // Only process messages from admin
    if (chatId !== process.env.TELEGRAM_ADMIN_CHAT_ID) {
      return NextResponse.json({ ok: true });
    }

    if (!text) return NextResponse.json({ ok: true });

    // Queue AI processing
    await tasks.trigger("ai-telegram-command", {
      message: text,
      chatId,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[telegram/webhook] Error:", err);
    return NextResponse.json({ ok: true }); // Always 200 for Telegram
  }
}
```

**Step 3: Commit**

```bash
git add lib/telegram.ts app/api/integrations/telegram/
git commit -m "feat: add Telegram bot integration with webhook"
```

---

## Phase 11: Integration — Slack

### Task 25: Slack webhook handler

**Files:**
- Create: `lib/slack.ts`
- Create: `app/api/integrations/slack/events/route.ts`

**Step 1: Write Slack utilities**

```typescript
// lib/slack.ts
import { createHmac, timingSafeEqual } from "crypto";

export function verifySlackSignature(
  signingSecret: string,
  timestamp: string,
  body: string,
  signature: string
): boolean {
  // Reject requests older than 5 minutes
  const time = Math.floor(Date.now() / 1000);
  if (Math.abs(time - Number(timestamp)) > 60 * 5) return false;

  const sigBasestring = `v0:${timestamp}:${body}`;
  const mySignature = "v0=" + createHmac("sha256", signingSecret)
    .update(sigBasestring)
    .digest("hex");

  return timingSafeEqual(Buffer.from(mySignature), Buffer.from(signature));
}

export async function postSlackMessage(channel: string, text: string): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) throw new Error("SLACK_BOT_TOKEN not set");

  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ channel, text }),
  });

  if (!res.ok) {
    console.error("[slack] Post failed:", await res.text());
  }
}
```

**Step 2: Write Slack events route**

```typescript
// app/api/integrations/slack/events/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifySlackSignature } from "@/lib/slack";
import { tasks } from "@trigger.dev/sdk/v3";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const body = JSON.parse(rawBody);

  // Handle Slack URL verification challenge
  if (body.type === "url_verification") {
    return NextResponse.json({ challenge: body.challenge });
  }

  // Verify signature
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (signingSecret) {
    const timestamp = req.headers.get("x-slack-request-timestamp") || "";
    const signature = req.headers.get("x-slack-signature") || "";

    if (!verifySlackSignature(signingSecret, timestamp, rawBody, signature)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  // Handle event callbacks
  if (body.type === "event_callback") {
    const event = body.event;

    // Only process app_mention events
    if (event?.type === "app_mention") {
      const text = event.text as string;
      const user = event.user as string;
      const channel = event.channel as string;

      await tasks.trigger("ai-process-inbound", {
        content: text,
        sender: `Slack user <@${user}>`,
        source: "slack" as const,
        metadata: {
          channel,
          user,
          thread_ts: event.thread_ts || event.ts,
          team: body.team_id,
        },
      });
    }
  }

  return NextResponse.json({ ok: true });
}
```

**Step 3: Commit**

```bash
git add lib/slack.ts app/api/integrations/slack/
git commit -m "feat: add Slack events webhook integration"
```

---

## Phase 12: Integration — Email Inbound

### Task 26: Resend inbound email webhook

**Files:**
- Create: `app/api/integrations/email/inbound/route.ts`

**Step 1: Write email inbound route**

```typescript
// app/api/integrations/email/inbound/route.ts
import { NextRequest, NextResponse } from "next/server";
import { tasks } from "@trigger.dev/sdk/v3";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Resend inbound webhook payload
    const {
      from: senderEmail,
      to,
      subject,
      text: textBody,
      html: htmlBody,
    } = body;

    // Only process emails to tasks@websitereveals.com
    const targetEmails = (to || []) as string[];
    if (!targetEmails.some((e: string) => e.includes("tasks@websitereveals.com"))) {
      return NextResponse.json({ ok: true });
    }

    // Extract plain text content (prefer text over HTML)
    const content = textBody || htmlBody?.replace(/<[^>]*>/g, "") || "";

    if (!content.trim()) {
      return NextResponse.json({ ok: true });
    }

    // Queue AI processing
    await tasks.trigger("ai-process-inbound", {
      content,
      sender: senderEmail || "unknown",
      source: "email" as const,
      subject: subject || undefined,
      metadata: {
        from: senderEmail,
        to: targetEmails,
        subject,
        has_attachments: !!(body.attachments && body.attachments.length > 0),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[email/inbound] Error:", err);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
```

**Step 2: Commit**

```bash
git add app/api/integrations/email/
git commit -m "feat: add Resend inbound email webhook integration"
```

---

## Phase 13: Environment Variables and Final Wiring

### Task 27: Update environment configuration

**Files:**
- Modify: `.env.example`

**Step 1: Add new environment variables**

Add to `.env.example`:

```bash
# Client Task Management
PORTAL_JWT_SECRET=          # Secret for portal JWT tokens (falls back to SUPABASE_SERVICE_ROLE_KEY)
ANTHROPIC_API_KEY=          # Claude API key for AI agent

# Telegram Bot
TELEGRAM_BOT_TOKEN=         # From BotFather
TELEGRAM_ADMIN_CHAT_ID=     # Your Telegram chat ID

# Slack Integration
SLACK_BOT_TOKEN=            # Slack bot OAuth token
SLACK_SIGNING_SECRET=       # Slack app signing secret
```

**Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: add new environment variables to .env.example"
```

---

### Task 28: Wire AI estimates into task creation and status changes

**Files:**
- Modify: `app/api/admin/tasks/route.ts` (POST handler)
- Modify: `app/api/admin/tasks/[id]/status/route.ts` (PUT handler)

**Step 1: Trigger AI estimate on task creation**

In the POST handler of `app/api/admin/tasks/route.ts`, after task creation:

```typescript
import { tasks as triggerTasks } from "@trigger.dev/sdk/v3";

// After task is created...
try {
  await triggerTasks.trigger("ai-estimate", { taskId: task.id });
} catch (estimateErr) {
  console.error("[admin/tasks] AI estimate trigger failed:", estimateErr);
}
```

**Step 2: Trigger AI re-estimate on status change**

In the PUT handler of `app/api/admin/tasks/[id]/status/route.ts`, after status update:

```typescript
// After status change (for non-complete statuses)
if (status !== "complete") {
  try {
    await triggerTasks.trigger("ai-estimate", { taskId: id });
  } catch (estimateErr) {
    console.error("[admin/tasks] AI re-estimate trigger failed:", estimateErr);
  }
}
```

**Step 3: Commit**

```bash
git add app/api/admin/tasks/route.ts app/api/admin/tasks/[id]/status/route.ts
git commit -m "feat: wire AI estimates into task creation and status changes"
```

---

### Task 29: Send Telegram notifications for client comments/requests

**Files:**
- Modify: `app/api/portal/tasks/[id]/comments/route.ts`

**Step 1: Add Telegram notification**

In the POST handler, after sending admin email notification:

```typescript
import { sendTelegramMessage } from "@/lib/telegram";

// After email notification...
try {
  await sendTelegramMessage(
    `💬 *${client.first_name} ${client.last_name}* (${client.company_name}) ${is_request ? "submitted a request" : "commented"} on:\n\n*${task.title}*\n\n"${content}"`
  );
} catch (telegramErr) {
  console.error("[portal/comments] Telegram notification failed:", telegramErr);
}
```

**Step 2: Commit**

```bash
git add app/api/portal/tasks/[id]/comments/route.ts
git commit -m "feat: send Telegram notification on client comments"
```

---

## Phase 14: Verification and Testing

### Task 30: Manual integration test checklist

Run through each flow manually to verify:

1. **Client creation:** POST to `/api/admin/clients` → client created → welcome email sent with PIN
2. **PIN login:** POST to `/api/portal/login` with email + PIN → JWT cookie set → access portal
3. **Task creation:** POST to `/api/admin/tasks` → task created → client email sent → AI estimate triggered
4. **Status change:** PUT to `/api/admin/tasks/[id]/status` with notes → status updated → client email with notes → history recorded
5. **Client comment:** POST to `/api/portal/tasks/[id]/comments` → comment saved → admin email + Telegram notification
6. **Form auto-creation:** Submit a form → client auto-created → welcome email sent
7. **Telegram command:** Send message to bot → AI processes → task created/updated → response back
8. **Slack @mention:** Post in Slack → webhook fires → AI processes → Telegram proposal → approve → task created
9. **Email inbound:** Forward email to tasks@websitereveals.com → webhook fires → AI processes → Telegram proposal

Run: `npx tsc --noEmit` to verify no type errors
Run: `npm run build` to verify build succeeds

**Commit final verification:**

```bash
git add -A
git commit -m "feat: complete client task management system implementation"
```

---

## Summary of New Files

```
lib/
  types/client-tasks.ts          — Type definitions
  pin.ts                          — PIN generation/hashing
  clients.ts                      — Client CRUD
  tasks.ts                        — Task CRUD
  portal-auth.ts                  — Portal JWT auth
  task-emails.ts                  — Email notification templates
  ai-agent.ts                     — Claude API integration
  telegram.ts                     — Telegram bot utilities
  slack.ts                        — Slack utilities

app/
  api/admin/clients/              — Client management API
  api/admin/tasks/                — Task management API
  api/portal/login/               — Portal login
  api/portal/logout/              — Portal logout
  api/portal/tasks/               — Portal task viewing + comments
  api/integrations/telegram/      — Telegram webhook
  api/integrations/slack/         — Slack events webhook
  api/integrations/email/         — Email inbound webhook
  portal/login/page.tsx           — Portal login page
  portal/layout.tsx               — Portal layout
  portal/page.tsx                 — Portal dashboard
  portal/tasks/page.tsx           — Portal tasks page

components/
  admin/AdminNav.tsx              — Tabbed admin navigation
  admin/ClientsPanel.tsx          — Client list + management
  admin/ClientDetailDrawer.tsx    — Client detail drawer
  admin/TasksPanel.tsx            — Kanban board + list view
  admin/TaskDetailDrawer.tsx      — Task detail drawer
  admin/AddTaskModal.tsx          — Add task modal
  portal/TaskCard.tsx             — Portal task card

src/trigger/
  ai-estimate.ts                  — AI estimation task
  ai-process-inbound.ts           — Inbound message processing
  ai-telegram-command.ts          — Telegram command processing

supabase/migrations/
  007_client_task_management.sql  — Database migration

New env vars: PORTAL_JWT_SECRET, ANTHROPIC_API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_ADMIN_CHAT_ID, SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET
```

## Execution Order

Phases 1-3 (foundation) must go first. After that, Phases 4-6 (API routes) can be parallelized. Phases 7-8 (admin + portal UI) depend on API routes. Phases 9-12 (AI + integrations) can be parallelized but depend on Phase 2 library functions. Phase 13 wires everything together. Phase 14 verifies.

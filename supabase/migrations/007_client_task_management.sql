-- 007_client_task_management.sql
-- Client task management system: clients, tasks, comments, status history, AI velocity,
-- Telegram conversations, inbound proposals, and PIN login rate limiting.

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

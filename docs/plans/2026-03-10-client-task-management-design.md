# Client Task Management System — Design

**Date:** 2026-03-10
**Approach:** Hybrid — Next.js for web + Trigger.dev for AI agent processing

## Overview

A client task management system that gives clients transparency into their projects. Admin manages clients and tasks; clients log in via PIN to view status, comment, and submit requests. AI agent handles estimates, processes inbound messages from Slack/Email, and accepts commands via Telegram.

## Data Model

### `clients`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| first_name | text | |
| last_name | text | |
| company_name | text | |
| phone | text | nullable |
| email | text | unique |
| website_url | text | nullable |
| github_repo_url | text | nullable |
| pin | text | 6-digit, auto-generated, hashed |
| form_session_token | uuid | nullable FK → form_sessions.token |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `tasks`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| client_id | uuid | FK → clients.id |
| parent_task_id | uuid | nullable FK → tasks.id (subtasks) |
| title | text | |
| description | text | nullable |
| status | enum | backlog, in_progress, blocked, complete |
| priority | enum | low, medium, high, urgent |
| tags | text[] | e.g. "design", "development" |
| due_date | date | nullable |
| time_estimate_minutes | int | nullable |
| time_tracked_minutes | int | default 0 |
| attachments | jsonb | array of {name, url, type} |
| sort_order | int | ordering within status column |
| created_at | timestamptz | |
| updated_at | timestamptz | |
| completed_at | timestamptz | nullable |

### `task_comments`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| task_id | uuid | FK → tasks.id |
| author_type | enum | admin, client, system |
| author_name | text | |
| content | text | |
| created_at | timestamptz | |

### `task_status_history`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| task_id | uuid | FK → tasks.id |
| old_status | text | |
| new_status | text | |
| notes | text | nullable — included in client email |
| changed_by | text | admin, system, ai-agent |
| created_at | timestamptz | |

### `ai_velocity_log`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| task_id | uuid | FK → tasks.id |
| tags | text[] | snapshot at completion |
| time_estimate_minutes | int | original estimate |
| time_tracked_minutes | int | actual time |
| complexity_score | int | 1-5, AI-assigned |
| completed_at | timestamptz | |

## Admin Panel — Client Management

**Route:** `/admin/clients` (new tab in admin nav)

**Client list:** Table with name, company, email, phone, active task count, last activity. Searchable, sortable. "Add Client" button.

**Client detail (drawer):** Contact info, masked PIN with reset button, link to form submission, task summary by status, quick-add task button.

**Add/edit modal:** First name, last name, company, phone, email, website URL, GitHub repo URL. PIN auto-generated on create. Welcome email sent with PIN and portal link.

**Auto-creation from form submissions:** On form submit, check if client exists by email. If not, create one and link form_session_token. If yes, link to existing client.

## Admin Panel — Task Management

**Route:** `/admin/tasks` (new tab in admin nav)

**Board view (default):** Kanban columns — Backlog, In Progress, Blocked, Complete. Cards show title, client, priority badge, tags, due date, subtask progress. Drag-and-drop between columns with optional notes modal (notes included in status email).

**List view (toggle):** Dense table alternative. Columns: title, client, status, priority, tags, due date, estimate, tracked time. Sortable, filterable.

**Task detail (drawer):** Full editing — title, description (markdown), status with notes, priority, tags (predefined + custom), client, due date, time estimate, time tracker (start/stop + manual), subtasks (inline), attachments (Supabase Storage), comments, status history timeline.

**Predefined tags:** Design, Development, Content, Bug Fix, SEO, Hosting/DNS, Maintenance, Consultation.

## Client Portal

**Route:** `/portal`

**Login (`/portal/login`):** Email + 6-digit PIN. Rate-limited (5 attempts per email per 15 min). Session via JWT cookie (30-day expiry). Matches admin aesthetic (dark tones, serif fonts, glowing accents).

**Dashboard (`/portal`):** Welcome header, status summary cards, AI-generated estimated completion banner for all active tasks.

**Task list (`/portal/tasks`):** Grouped by status (In Progress → Blocked → Backlog → Complete). Click to expand inline.

**Task detail (inline expand):** Title, description, status, priority, tags, due date, AI estimate, subtask progress, attachments (download), comments (read + post). Clients can submit questions/requests flagged for admin attention.

**Restrictions:** Clients cannot change task fields, delete anything, or see other clients' data. No visibility into time tracking or internal notes.

## AI Agent Architecture

All AI processing via Claude API, executed as Trigger.dev tasks.

### `ai-estimate`

Triggered on task create, status change, or on-demand. Inputs: task details + velocity data from `ai_velocity_log`. Outputs: complexity_score (1-5), estimated completion date, confidence level. Recalculates in batch when queue changes.

### `ai-process-inbound`

Triggered by Slack or Email webhooks. Inputs: raw message, sender info, source. Outputs: client match (or "unknown"), proposed task (title, description, priority, tags), proposed response. Result sent to admin via Telegram for approve/reject/edit.

### `ai-telegram-command`

Triggered by Telegram webhook. Inputs: message text + conversation context. Interprets intent: create/update/delete tasks, add clients, check status, approve proposals. Creates/updates execute directly. Deletes require confirmation. Responds conversationally.

AI agent has full client list and active task queue in context. Can create/update freely; destructive actions require admin approval via Telegram.

## Email Notifications

**From:** `tasks@websitereveals.com` (Resend)

| Event | Recipient | Content |
|-------|-----------|---------|
| Client created | Client | Welcome + PIN + portal link |
| PIN reset | Client | New PIN + portal link |
| Task created | Client | Task details + portal link |
| Status → In Progress | Client | "Work started" + notes |
| Status → Blocked | Client | "We need something from you" + notes |
| Status → Complete | Client | "Task complete" + notes |
| Admin comment | Client | Comment preview + portal link |
| Client comment/request | Admin | Content via email + Telegram |

Batch multiple updates into single digest email. Branded template with logo, clear subject lines prefixed "[Website Reveals]".

## Integrations

### Slack

1. Existing Slack bot detects @mention
2. Event hits `/api/integrations/slack/events`
3. Validate Slack signature, extract content
4. Queue `ai-process-inbound` (source: "slack")
5. AI proposes task + reply → sends to Telegram
6. Admin approves/edits/rejects via Telegram
7. On approve: task created, reply posted back in Slack channel with @mention

### Email Inbox

1. Email sent/forwarded to `tasks@websitereveals.com`
2. Resend inbound webhook hits `/api/integrations/email/inbound`
3. Parse sender, subject, body, attachments
4. Queue `ai-process-inbound` (source: "email")
5. AI matches client, proposes task + draft reply → sends to Telegram
6. Admin approves/edits/rejects
7. On approve: task created, reply sent from `tasks@websitereveals.com`

### Telegram

1. Webhook hits `/api/integrations/telegram/webhook`
2. Validate request, extract message
3. Queue `ai-telegram-command`
4. AI interprets and executes (or confirms deletes)
5. Responds via Telegram Bot API

Natural language commands — no rigid syntax. Supports: add/update/delete tasks, manage clients, check status, approve/reject inbound proposals.

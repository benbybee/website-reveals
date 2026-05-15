-- Migration 007 created a CHECK constraint on tasks.status that pre-dates the
-- introduction of the "review" stage. Every UPDATE to status='review' was
-- being rejected as a constraint violation, blocking both the admin UI's
-- manual transitions and the sl-callback auto-transition on `live`.

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE tasks
  ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('backlog', 'in_progress', 'review', 'blocked', 'complete'));

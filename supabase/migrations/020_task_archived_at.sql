-- Task archival: completed tasks auto-archive 7 days after completion.
-- archived_at IS NULL means active; populated means archived.
-- Archived tasks stay in the DB but disappear from default views.
-- The /admin/archived view shows the last 90 days of archived tasks.

ALTER TABLE tasks ADD COLUMN archived_at timestamp with time zone;

-- Most queries filter "active" tasks (archived_at IS NULL); partial index
-- keeps that fast.
CREATE INDEX tasks_active_idx ON tasks(updated_at DESC) WHERE archived_at IS NULL;

-- Archived view sorts most-recently-archived first within the 90d window.
CREATE INDEX tasks_archived_at_idx ON tasks(archived_at DESC) WHERE archived_at IS NOT NULL;

-- Outbound Dispatchr notification tracking.
-- The hourly abandonment cron uses this column to ensure each abandoned
-- form_session fires the submission.abandoned event exactly once.

ALTER TABLE form_sessions ADD COLUMN dispatchr_notified_abandoned_at timestamp with time zone;

-- Partial index speeds up the cron query (only rows still in scope are scanned).
CREATE INDEX form_sessions_unnotified_abandoned_idx
  ON form_sessions(created_at)
  WHERE submitted_at IS NULL AND dispatchr_notified_abandoned_at IS NULL;

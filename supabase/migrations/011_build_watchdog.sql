-- Track how many times a build job has been auto-resubmitted by the watchdog
ALTER TABLE build_jobs
  ADD COLUMN IF NOT EXISTS resubmit_count integer NOT NULL DEFAULT 0;

-- Index for watchdog queries (active jobs by status + age)
CREATE INDEX IF NOT EXISTS build_jobs_status_created_idx
  ON build_jobs (status, created_at)
  WHERE status IN ('queued', 'building');

-- Sales reps as first-class users + 'review' task stage + build_jobs.task_id link

-- Link build_jobs back to its tracking task so callbacks can transition the task
ALTER TABLE build_jobs ADD COLUMN task_id uuid;
CREATE INDEX build_jobs_task_id_idx ON build_jobs(task_id) WHERE task_id IS NOT NULL;

-- Sales reps. Auth via email + PIN, same shape as the client portal.
CREATE TABLE sales_reps (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text UNIQUE NOT NULL,
  first_name text NOT NULL,
  last_name  text,
  pin        text NOT NULL,                          -- 6-digit code (plaintext for simplicity; rotate via /admin)
  active     boolean NOT NULL DEFAULT true,
  notes      text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX sales_reps_email_idx ON sales_reps(LOWER(email));

ALTER TABLE sales_reps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on sales_reps"
  ON sales_reps FOR ALL USING (true) WITH CHECK (true);

-- Link form_sessions to the rep who submitted on behalf of the client.
-- Nullable: populated on /sales submissions where contact_email matches a rep.
ALTER TABLE form_sessions ADD COLUMN sales_rep_id uuid REFERENCES sales_reps(id) ON DELETE SET NULL;
CREATE INDEX form_sessions_sales_rep_id_idx ON form_sessions(sales_rep_id) WHERE sales_rep_id IS NOT NULL;

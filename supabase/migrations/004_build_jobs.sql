-- Build jobs table for automated website generation
CREATE TABLE build_jobs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token       uuid NOT NULL REFERENCES form_sessions(token) ON DELETE CASCADE,
  form_type   text NOT NULL,                          -- quick | standard | in-depth | novalux | new-client | future types
  status      text NOT NULL DEFAULT 'queued',         -- queued | building | deployed | failed
  repo_url    text,                                   -- GitHub repo URL once created
  site_url    text,                                   -- Live site URL once deployed
  error       text,                                   -- Error message if failed
  started_at  timestamp with time zone,
  completed_at timestamp with time zone,
  created_at  timestamp with time zone NOT NULL DEFAULT now()
);

-- Index for token lookups (join with form_sessions)
CREATE INDEX build_jobs_token_idx ON build_jobs(token);

-- Index for status polling (worker picks up queued jobs)
CREATE INDEX build_jobs_status_idx ON build_jobs(status);

-- RLS
ALTER TABLE build_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on build_jobs"
  ON build_jobs FOR ALL
  USING (true)
  WITH CHECK (true);

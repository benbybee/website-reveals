-- Rate limit tracking table for webhook endpoints
CREATE TABLE rate_limit_entries (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ip         text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Index for efficient window queries
CREATE INDEX rate_limit_entries_ip_created_idx ON rate_limit_entries(ip, created_at DESC);

-- Auto-cleanup: delete entries older than 2 hours (beyond any rate window)
-- Run via pg_cron or scheduled function
CREATE OR REPLACE FUNCTION cleanup_rate_limit_entries()
RETURNS void AS $$
  DELETE FROM rate_limit_entries WHERE created_at < now() - interval '2 hours';
$$ LANGUAGE sql;

-- RLS: only service role can access this table
ALTER TABLE rate_limit_entries ENABLE ROW LEVEL SECURITY;

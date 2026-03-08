-- Form sessions table for multi-step questionnaire with save/resume
CREATE TABLE form_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token       uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  email       text,
  current_step int DEFAULT 1,
  form_data   jsonb DEFAULT '{}',
  file_urls   jsonb DEFAULT '[]',
  dns_provider text,
  submitted_at timestamp with time zone,
  expires_at  timestamp with time zone NOT NULL DEFAULT now() + interval '30 days',
  created_at  timestamp with time zone NOT NULL DEFAULT now()
);

-- Index for token lookups (used on every resume request)
CREATE INDEX form_sessions_token_idx ON form_sessions(token);

-- Row Level Security
ALTER TABLE form_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can create a session"
  ON form_sessions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can read by token"
  ON form_sessions FOR SELECT
  USING (true);

CREATE POLICY "Anyone can update by token"
  ON form_sessions FOR UPDATE
  USING (true);

-- Template Site pipeline: one row per SL push. Tracks chunk/record counts, the
-- transport used, and SL's response/callback state so per-chunk retries only
-- re-send failures.

CREATE TABLE IF NOT EXISTS tpl_sl_batches (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  uuid NOT NULL REFERENCES tpl_campaigns(id) ON DELETE CASCADE,
  batch_id     text UNIQUE,
  chunk_count  int,
  record_count int,
  transport    text,                       -- 'post' | 'table'
  status       text NOT NULL DEFAULT 'pending',
  sl_response  jsonb,
  created_at   timestamp with time zone NOT NULL DEFAULT now(),
  updated_at   timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX tpl_sl_batches_campaign_idx ON tpl_sl_batches(campaign_id);

ALTER TABLE tpl_sl_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on tpl_sl_batches"
  ON tpl_sl_batches FOR ALL USING (true) WITH CHECK (true);

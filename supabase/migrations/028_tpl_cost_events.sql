-- Template Site pipeline: append-only Apify cost ledger. Read ACTUAL consumption
-- from Apify run stats (not estimates). Powers cost-per-qualified-record rollups.

CREATE TABLE IF NOT EXISTS tpl_cost_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES tpl_campaigns(id) ON DELETE CASCADE,
  stage       text NOT NULL,               -- 'discover' | 'audit' | 'enrich' | 'backfill'
  actor       text,
  units       numeric,
  usd         numeric,
  run_id      text,
  created_at  timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX tpl_cost_events_campaign_idx ON tpl_cost_events(campaign_id);

ALTER TABLE tpl_cost_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on tpl_cost_events"
  ON tpl_cost_events FOR ALL USING (true) WITH CHECK (true);

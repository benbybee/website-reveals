-- Template Site pipeline: one row per real business = canonical record.
-- `record` JSONB holds SL's exact normalized shape; promoted columns exist for
-- filtering/sorting in the CRM. source_id = stable dedupe key ("wr-tpl-{place_id}");
-- re-running a campaign upserts on it (overwrite, never duplicate).

CREATE TABLE IF NOT EXISTS tpl_prospects (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id    uuid NOT NULL REFERENCES tpl_campaigns(id) ON DELETE CASCADE,
  source_id      text UNIQUE NOT NULL,
  place_id       text,
  record         jsonb NOT NULL DEFAULT '{}',
  business_name  text,
  city           text,
  state          text,
  phone          text,
  website        text,
  website_status text NOT NULL DEFAULT 'none',
  confidence     numeric,
  completeness   jsonb,
  stage          text NOT NULL DEFAULT 'scraped',
  agent_id       text,
  created_at     timestamp with time zone NOT NULL DEFAULT now(),
  updated_at     timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX tpl_prospects_campaign_stage_idx  ON tpl_prospects(campaign_id, stage);
CREATE INDEX tpl_prospects_campaign_wstatus_idx ON tpl_prospects(campaign_id, website_status);
CREATE INDEX tpl_prospects_agent_idx           ON tpl_prospects(agent_id) WHERE agent_id IS NOT NULL;

ALTER TABLE tpl_prospects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on tpl_prospects"
  ON tpl_prospects FOR ALL USING (true) WITH CHECK (true);

-- Template Site pipeline: one scrape request. industry_slug is a SOFT reference
-- to tpl_industries.slug (no hard FK, so the module stays detachable). locations
-- is a JSONB array of {state, city, radius?} entries. Counts roll up live.

CREATE TABLE IF NOT EXISTS tpl_campaigns (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  industry_slug    text NOT NULL,
  locations        jsonb NOT NULL DEFAULT '[]',
  target_count     int NOT NULL DEFAULT 0,
  audit_enabled    boolean NOT NULL DEFAULT false,
  status           text NOT NULL DEFAULT 'draft',
  scraped_count    int NOT NULL DEFAULT 0,
  qualified_count  int NOT NULL DEFAULT 0,
  incomplete_count int NOT NULL DEFAULT 0,
  pushed_count     int NOT NULL DEFAULT 0,
  created_by       text,
  created_at       timestamp with time zone NOT NULL DEFAULT now(),
  updated_at       timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX tpl_campaigns_status_idx ON tpl_campaigns(status);

ALTER TABLE tpl_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on tpl_campaigns"
  ON tpl_campaigns FOR ALL USING (true) WITH CHECK (true);

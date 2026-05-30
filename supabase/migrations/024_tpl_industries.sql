-- Template Site pipeline: own industry taxonomy (independent of WR's `industries`).
-- google_categories[] = Google Maps category strings to query; sl_slug = the
-- controlled-vocabulary industry_slug SL's template library matches templates on.

CREATE TABLE IF NOT EXISTS tpl_industries (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              text UNIQUE NOT NULL,
  display_name      text NOT NULL,
  google_categories text[] NOT NULL DEFAULT '{}',
  sl_slug           text NOT NULL,
  created_at        timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE tpl_industries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on tpl_industries"
  ON tpl_industries FOR ALL USING (true) WITH CHECK (true);

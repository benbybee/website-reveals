-- Template Site pipeline: logo/photo rows per prospect. fetch_verified flag keeps
-- asset verification auditable (HEAD-checked live + image content-type before push).

CREATE TABLE IF NOT EXISTS tpl_prospect_assets (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id    uuid NOT NULL REFERENCES tpl_prospects(id) ON DELETE CASCADE,
  kind           text NOT NULL,            -- 'logo' | 'photo'
  slot           text,                     -- template image slot: hero | about | service-1 ...
  src_url        text NOT NULL,
  alt            text,
  width          int,
  height         int,
  fetch_verified boolean NOT NULL DEFAULT false,
  created_at     timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX tpl_prospect_assets_prospect_idx ON tpl_prospect_assets(prospect_id);

ALTER TABLE tpl_prospect_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on tpl_prospect_assets"
  ON tpl_prospect_assets FOR ALL USING (true) WITH CHECK (true);

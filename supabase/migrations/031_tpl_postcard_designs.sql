-- Template Site GTM: uploaded postcard designs. The operator uploads front/back
-- artwork (PNG/PDF) which is stored in Vercel Blob; we keep the public blob URLs
-- here and pass them to Lob as the postcard `front`/`back`. A design is authored
-- once and assigned to one or more campaigns (tpl_campaigns.postcard_design_id).
-- `size` is a Lob postcard size ('4x6' | '6x9' | '6x11'). `merge_fields` records
-- which CanonicalRecord/merge variables the artwork expects (documentation +
-- forward-compat for HTML templates); v1 artwork is static image + a QR overlay
-- handled at send time.

CREATE TABLE IF NOT EXISTS tpl_postcard_designs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  size          text NOT NULL DEFAULT '4x6',
  front_url     text,
  back_url      text,
  merge_fields  jsonb NOT NULL DEFAULT '[]',
  archived      boolean NOT NULL DEFAULT false,
  created_by    text,
  created_at    timestamp with time zone NOT NULL DEFAULT now(),
  updated_at    timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX tpl_postcard_designs_active_idx ON tpl_postcard_designs(archived) WHERE archived = false;

ALTER TABLE tpl_postcard_designs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on tpl_postcard_designs"
  ON tpl_postcard_designs FOR ALL USING (true) WITH CHECK (true);

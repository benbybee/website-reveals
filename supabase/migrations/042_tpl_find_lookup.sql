-- Template Site GTM v2: single-QR "Find Your Site" lookup + engagement tracking.
-- One static QR on every postcard points at /join; the recipient types business
-- name + ZIP to reach their preview. Identity comes from what they type (a shared
-- QR can't carry it), so we promote the match keys to indexed columns and track
-- looked-up/clicked per prospect (replacing the per-card scan signal on the board).
-- All additive + idempotent; record JSONB stays the SL-callback write target and
-- these columns are a queryable mirror. Nothing is moved or dropped.

-- 1. Promote match/target fields from record JSONB to indexed columns.
ALTER TABLE tpl_prospects
  ADD COLUMN IF NOT EXISTS preview_url  text,
  ADD COLUMN IF NOT EXISTS sl_build_id  text,
  ADD COLUMN IF NOT EXISTS zip          text,
  ADD COLUMN IF NOT EXISTS lookup_count      integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_looked_up_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS click_count       integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_clicked_at   timestamp with time zone;

-- 2. Backfill from existing JSONB. zip normalized to 5 digits so the exact-match
--    index path lines up with what the lookup form sends.
UPDATE tpl_prospects SET
  preview_url = COALESCE(preview_url, NULLIF(record->>'preview_url','')),
  sl_build_id = COALESCE(sl_build_id, NULLIF(record->>'sl_build_id','')),
  zip = COALESCE(zip, NULLIF(left(regexp_replace(COALESCE(record->'address'->>'zip',''), '\D', '', 'g'), 5), ''));

-- 3. Matching support: forgiving fuzzy name + exact zip.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS tpl_prospects_name_trgm_idx
  ON tpl_prospects USING gin (business_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS tpl_prospects_zip_idx
  ON tpl_prospects(zip) WHERE zip IS NOT NULL;
CREATE INDEX IF NOT EXISTS tpl_prospects_preview_idx
  ON tpl_prospects(id) WHERE preview_url IS NOT NULL;

-- 4. Append-only lookup/click event log (same shape as tpl_qr_scans).
CREATE TABLE IF NOT EXISTS tpl_prospect_lookups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES tpl_prospects(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES tpl_campaigns(id) ON DELETE SET NULL,
  kind        text NOT NULL CHECK (kind IN ('resolved','clicked')),
  ip          text,
  user_agent  text,
  at          timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tpl_prospect_lookups_prospect_idx ON tpl_prospect_lookups(prospect_id);
CREATE INDEX IF NOT EXISTS tpl_prospect_lookups_campaign_idx ON tpl_prospect_lookups(campaign_id);

ALTER TABLE tpl_prospect_lookups ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Service role full access on tpl_prospect_lookups"
    ON tpl_prospect_lookups FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 5. Search function: exact zip + trigram name, only lookup-eligible rows.
--    `%` uses pg_trgm's similarity threshold (default 0.3). Returns top matches
--    by similarity so the route can decide none/one/many.
CREATE OR REPLACE FUNCTION tpl_find_prospects(p_name text, p_zip text)
RETURNS TABLE (id uuid, business_name text, city text, state text, preview_url text, sim real)
LANGUAGE sql STABLE AS $$
  SELECT id, business_name, city, state, preview_url,
         similarity(business_name, p_name) AS sim
  FROM tpl_prospects
  WHERE preview_url IS NOT NULL
    AND zip = p_zip
    AND business_name % p_name
  ORDER BY sim DESC, business_name ASC
  LIMIT 10;
$$;

-- 6. Atomic recorder: append the event, bump the matching rollup, return the
--    prospect's preview_url (so the /s click redirect resolves in one round trip,
--    mirroring tpl_record_qr_scan). NULL if the prospect is gone.
CREATE OR REPLACE FUNCTION tpl_record_lookup(
  p_prospect_id uuid,
  p_kind        text,
  p_ip          text,
  p_user_agent  text
) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  pr RECORD;
BEGIN
  SELECT campaign_id, preview_url INTO pr FROM tpl_prospects WHERE id = p_prospect_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  INSERT INTO tpl_prospect_lookups (prospect_id, campaign_id, kind, ip, user_agent)
    VALUES (p_prospect_id, pr.campaign_id, p_kind, p_ip, p_user_agent);

  IF p_kind = 'resolved' THEN
    UPDATE tpl_prospects
      SET lookup_count = lookup_count + 1, last_looked_up_at = now()
      WHERE id = p_prospect_id;
  ELSIF p_kind = 'clicked' THEN
    UPDATE tpl_prospects
      SET click_count = click_count + 1, last_clicked_at = now()
      WHERE id = p_prospect_id;
  END IF;

  RETURN pr.preview_url;
END;
$$;

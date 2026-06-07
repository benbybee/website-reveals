-- Template Site GTM: QR scan tracking. Each mailed postcard carries a tracked QR
-- whose target is our own redirect (/r/<qr_token>), not the bare preview URL —
-- so a recipient scanning the card hits WR first, we log the scan, then 302 them
-- to their speculative preview. This closes the mail funnel: mailed -> scanned.
--
-- qr_token lives on the MAILING (the physical card), not the prospect: it is
-- minted at send time and is the opaque, enumeration-resistant id printed on the
-- card. scan_count / first_scanned_at / last_scanned_at are denormalized rollups
-- so the prospects table can show scan activity without aggregating the log.

ALTER TABLE tpl_mailings
  ADD COLUMN IF NOT EXISTS qr_token         text,
  ADD COLUMN IF NOT EXISTS scan_count       integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_scanned_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS last_scanned_at  timestamp with time zone;

-- One token per card; the partial unique index is also the scan lookup path.
CREATE UNIQUE INDEX IF NOT EXISTS tpl_mailings_qr_token_idx
  ON tpl_mailings(qr_token)
  WHERE qr_token IS NOT NULL;

-- Append-only scan log. prospect_id / campaign_id are denormalized off the
-- mailing so per-prospect and per-campaign analytics need no join back.
CREATE TABLE IF NOT EXISTS tpl_qr_scans (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mailing_id   uuid NOT NULL REFERENCES tpl_mailings(id) ON DELETE CASCADE,
  prospect_id  uuid NOT NULL REFERENCES tpl_prospects(id) ON DELETE CASCADE,
  campaign_id  uuid REFERENCES tpl_campaigns(id) ON DELETE SET NULL,
  token        text NOT NULL,
  ip           text,
  user_agent   text,
  referer      text,
  scanned_at   timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tpl_qr_scans_mailing_idx  ON tpl_qr_scans(mailing_id);
CREATE INDEX IF NOT EXISTS tpl_qr_scans_prospect_idx ON tpl_qr_scans(prospect_id);
CREATE INDEX IF NOT EXISTS tpl_qr_scans_campaign_idx ON tpl_qr_scans(campaign_id);

ALTER TABLE tpl_qr_scans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on tpl_qr_scans"
  ON tpl_qr_scans FOR ALL USING (true) WITH CHECK (true);

-- Atomic scan recorder: resolve the card by token, append the scan, bump the
-- mailing's rollups, and return the redirect target (frozen preview snapshot).
-- Returns NULL for an unknown token so the route can fall back gracefully. Doing
-- this in one function avoids a read-modify-write race under concurrent scans.
CREATE OR REPLACE FUNCTION tpl_record_qr_scan(
  p_token      text,
  p_ip         text,
  p_user_agent text,
  p_referer    text
) RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  m RECORD;
BEGIN
  SELECT id, prospect_id, campaign_id, preview_url_snapshot
    INTO m
    FROM tpl_mailings
    WHERE qr_token = p_token;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  INSERT INTO tpl_qr_scans (mailing_id, prospect_id, campaign_id, token, ip, user_agent, referer)
    VALUES (m.id, m.prospect_id, m.campaign_id, p_token, p_ip, p_user_agent, p_referer);

  UPDATE tpl_mailings
    SET scan_count       = scan_count + 1,
        first_scanned_at = COALESCE(first_scanned_at, now()),
        last_scanned_at  = now()
    WHERE id = m.id;

  RETURN m.preview_url_snapshot;
END;
$$;

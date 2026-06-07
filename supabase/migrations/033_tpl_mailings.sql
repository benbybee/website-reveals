-- Template Site GTM: mail log + idempotency backbone. One row per prospect per
-- mail attempt. The UNIQUE constraint on prospect_id enforces the operator
-- decision "ONE card per prospect, ever" — a re-run (or a rebuilt preview) can
-- never mail the same business twice. status lifecycle:
--   queued -> verified -> sent           (happy path)
--   queued -> undeliverable               (Lob verification rejected the address)
--   queued -> failed                      (Lob create errored)
--   * -> suppressed                       (do_not_mail / manual exclude)
-- address_snapshot / preview_url_snapshot freeze what was actually mailed.
-- lob_id is Lob's postcard id; cost_usd is the per-card charge for the ledger.

CREATE TABLE IF NOT EXISTS tpl_mailings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id         uuid NOT NULL REFERENCES tpl_prospects(id) ON DELETE CASCADE,
  campaign_id         uuid REFERENCES tpl_campaigns(id) ON DELETE SET NULL,
  design_id           uuid REFERENCES tpl_postcard_designs(id) ON DELETE SET NULL,
  return_address_id   uuid REFERENCES tpl_return_addresses(id) ON DELETE SET NULL,
  status              text NOT NULL DEFAULT 'queued',
  lob_id              text,
  tracking_url        text,
  address_snapshot    jsonb,
  preview_url_snapshot text,
  cost_usd            numeric,
  error               text,
  created_at          timestamp with time zone NOT NULL DEFAULT now(),
  sent_at             timestamp with time zone
);

-- One card per prospect, ever (idempotency backbone).
CREATE UNIQUE INDEX tpl_mailings_prospect_unique_idx ON tpl_mailings(prospect_id);
CREATE INDEX tpl_mailings_campaign_status_idx ON tpl_mailings(campaign_id, status);
CREATE INDEX tpl_mailings_lob_idx ON tpl_mailings(lob_id) WHERE lob_id IS NOT NULL;

ALTER TABLE tpl_mailings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on tpl_mailings"
  ON tpl_mailings FOR ALL USING (true) WITH CHECK (true);

-- Template Site GTM: wire designs/return-addresses onto campaigns and add the
-- per-prospect mailing eligibility flags. postcard_design_id / return_address_id
-- are SOFT references (ON DELETE SET NULL) so a campaign keeps working if a design
-- or address is later archived/removed. mail_ready is the operator's bulk-set
-- "approved to mail" gate; do_not_mail is the suppression flag (honored even if
-- mail_ready is true).

ALTER TABLE tpl_campaigns
  ADD COLUMN IF NOT EXISTS postcard_design_id uuid REFERENCES tpl_postcard_designs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS return_address_id  uuid REFERENCES tpl_return_addresses(id) ON DELETE SET NULL;

ALTER TABLE tpl_prospects
  ADD COLUMN IF NOT EXISTS mail_ready  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS do_not_mail boolean NOT NULL DEFAULT false;

-- Eligible-to-mail lookup: live + flagged ready + not suppressed.
CREATE INDEX IF NOT EXISTS tpl_prospects_mail_eligible_idx
  ON tpl_prospects(campaign_id, mail_ready)
  WHERE mail_ready = true AND do_not_mail = false;

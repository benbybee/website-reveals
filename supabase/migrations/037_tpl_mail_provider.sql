-- Template Site GTM: per-campaign mail provider selection. A campaign is mailed
-- through one of three fulfillment paths:
--   'lob'        — Lob API, one postcard created per prospect (synchronous)
--   'click2mail' — Click2Mail MOL Pro, one batch job per campaign (document +
--                  address list + job), CASS/NCOA + native variable QR
--   'export'     — no automated send; the operator exports the CSV and imports
--                  it into an external tool by hand
-- Default 'lob' preserves existing behavior for every current campaign.

ALTER TABLE tpl_campaigns
  ADD COLUMN IF NOT EXISTS mail_provider text NOT NULL DEFAULT 'lob';

ALTER TABLE tpl_campaigns
  DROP CONSTRAINT IF EXISTS tpl_campaigns_mail_provider_chk;
ALTER TABLE tpl_campaigns
  ADD CONSTRAINT tpl_campaigns_mail_provider_chk
  CHECK (mail_provider IN ('lob', 'click2mail', 'export'));

-- Record which provider mailed each card and, for batch providers (Click2Mail),
-- the shared job id that covers many prospects. Lob keeps using lob_id (one id
-- per card); provider_job_id is the batch-level handle.
ALTER TABLE tpl_mailings
  ADD COLUMN IF NOT EXISTS provider        text,
  ADD COLUMN IF NOT EXISTS provider_job_id text;

CREATE INDEX IF NOT EXISTS tpl_mailings_provider_job_idx
  ON tpl_mailings(provider_job_id)
  WHERE provider_job_id IS NOT NULL;

-- Suppression detaches a lead from its campaign (campaign_id = NULL), per the
-- rule "a suppressed lead is no longer associated with a campaign". So the
-- column can no longer be NOT NULL. The FK to tpl_campaigns stays intact — a
-- NULL FK is simply "no campaign" (the detached/suppressed state) — and the
-- origin campaign is preserved in suppressed_from_campaign_id for restore.
-- Active prospects always have a campaign (set at discover/enrich); only
-- suppressed ones are detached.
ALTER TABLE tpl_prospects ALTER COLUMN campaign_id DROP NOT NULL;

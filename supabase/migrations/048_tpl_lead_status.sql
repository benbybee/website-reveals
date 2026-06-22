-- Per-lead sales status the rep (or operator) sets while working a lead:
-- new → no_answer / follow_up / scheduled_demo / contacted / not_interested / sold.
-- Replaces the binary "mark sold" with a pipeline status. `sold` stays mirrored
-- onto sold_at (set by the API) so the Convert flow + sold filter keep working.
ALTER TABLE tpl_prospects
  ADD COLUMN IF NOT EXISTS lead_status text NOT NULL DEFAULT 'new';

-- Filter/sort the board by anything that's been touched off the default.
CREATE INDEX IF NOT EXISTS tpl_prospects_lead_status_idx
  ON tpl_prospects(lead_status) WHERE lead_status <> 'new';

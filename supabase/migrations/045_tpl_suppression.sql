-- Template Site list-cleaning: non-destructive lead suppression.
-- Suppressed prospects are removed from the working CRM list AND every
-- downstream pool (build/dispatch, CSV export, mail send), but retained for a
-- cross-campaign "Suppressed" list with one-click restore. All additive and
-- reversible (NULL reset) — the data is never deleted. Same soft-flag
-- convention as sold_at/exported_at (see 044).

ALTER TABLE tpl_prospects
  ADD COLUMN IF NOT EXISTS suppressed_at      timestamp with time zone,  -- removed from the working list (NULL = active)
  ADD COLUMN IF NOT EXISTS suppressed_by      text,                       -- who suppressed it (admin email)
  ADD COLUMN IF NOT EXISTS suppression_reason text;                       -- why (e.g. "keyword: plumbing, electrical")

-- Active-list reads (the common path) filter suppressed_at IS NULL per campaign.
CREATE INDEX IF NOT EXISTS tpl_prospects_active_idx
  ON tpl_prospects(campaign_id) WHERE suppressed_at IS NULL;
-- The cross-campaign Suppressed list reads suppressed rows newest-first…
CREATE INDEX IF NOT EXISTS tpl_prospects_suppressed_idx
  ON tpl_prospects(suppressed_at) WHERE suppressed_at IS NOT NULL;
-- …and sorts/filters them by industry (canonical record->>industry_slug).
CREATE INDEX IF NOT EXISTS tpl_prospects_suppressed_industry_idx
  ON tpl_prospects((record->>'industry_slug')) WHERE suppressed_at IS NOT NULL;

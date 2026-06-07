-- Single-state campaign model. A campaign is now a long-lived, editable "list"
-- scoped to exactly one (industry_slug, state) pair — e.g. "pest-control / UT".
-- Re-runs develop that one list (add/enrich prospects) rather than spawning new
-- campaigns. The `state` column becomes the canonical scope; `locations` still
-- holds the city rows, but every city belongs to this campaign's state.

ALTER TABLE tpl_campaigns ADD COLUMN IF NOT EXISTS state text;

-- Backfill from the first location entry (all existing campaigns are single-state,
-- verified before this migration). Store as an uppercased 2-letter abbreviation.
UPDATE tpl_campaigns
   SET state = upper(trim(locations->0->>'state'))
 WHERE state IS NULL
   AND locations->0->>'state' IS NOT NULL
   AND trim(locations->0->>'state') <> '';

-- Enforce one campaign per (industry, state). Partial so draft campaigns that
-- have not yet picked a state (state IS NULL) don't collide with each other.
CREATE UNIQUE INDEX IF NOT EXISTS tpl_campaigns_industry_state_uniq
  ON tpl_campaigns (industry_slug, state)
  WHERE state IS NOT NULL;

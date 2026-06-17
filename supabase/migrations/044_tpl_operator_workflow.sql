-- Template Site operator workflow: rep assignment, "sold" tracking, export tracking.
-- All additive. sales_rep_id is a SOFT reference to sales_reps.id (no hard FK —
-- the tpl_ module stays detachable, same convention as agent_id, see 029).

ALTER TABLE tpl_prospects
  ADD COLUMN IF NOT EXISTS sales_rep_id uuid,         -- assigned rep (soft ref → sales_reps.id)
  ADD COLUMN IF NOT EXISTS sold_at      timestamp with time zone,  -- rep marked "sold" (NOT a convert; operator converts later)
  ADD COLUMN IF NOT EXISTS sold_by      text,         -- who marked it sold (rep id / admin email)
  ADD COLUMN IF NOT EXISTS exported_at  timestamp with time zone;  -- stamped when included in a CSV export

CREATE INDEX IF NOT EXISTS tpl_prospects_sales_rep_idx ON tpl_prospects(sales_rep_id) WHERE sales_rep_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS tpl_prospects_sold_idx       ON tpl_prospects(sold_at)      WHERE sold_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS tpl_prospects_exported_idx   ON tpl_prospects(exported_at)  WHERE exported_at IS NOT NULL;

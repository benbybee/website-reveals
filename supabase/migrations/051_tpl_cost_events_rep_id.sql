-- Gap 5: attribute per-rep spend on the interactive instant-preview flow so a
-- per-rep/day budget cap (lib/templates/cost/budget.ts) can guard runaway.
-- Nullable — bulk-campaign cost rows (discover/enrich) have no rep. Indexed on
-- (rep_id, created_at) for the per-rep/day sum query.
--
-- RLS note: tpl_cost_events already has RLS enabled + a service-role-only policy
-- (migration 028). Additive nullable column; no ownership column or new policy.
ALTER TABLE tpl_cost_events ADD COLUMN IF NOT EXISTS rep_id text;
CREATE INDEX IF NOT EXISTS tpl_cost_events_rep_idx ON tpl_cost_events(rep_id, created_at);

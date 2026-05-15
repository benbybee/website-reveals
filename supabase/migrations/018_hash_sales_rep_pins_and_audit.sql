-- 1) Hash sales rep PINs (mirror clients schema: pin_hash always, pin transient)
ALTER TABLE sales_reps ADD COLUMN pin_hash text;

-- Backfill pin_hash from existing plaintext pin (sha256, matching lib/pin.ts)
UPDATE sales_reps SET pin_hash = encode(digest(pin, 'sha256'), 'hex') WHERE pin_hash IS NULL;

ALTER TABLE sales_reps ALTER COLUMN pin_hash SET NOT NULL;
ALTER TABLE sales_reps ALTER COLUMN pin DROP NOT NULL;

-- 2) Audit log — actor + action + target with optional details payload
CREATE TABLE audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type  text NOT NULL CHECK (actor_type IN ('admin', 'sales_rep', 'client', 'system', 'sl')),
  actor_id    text,                         -- email for admin, uuid for rep/client, 'system' otherwise
  action      text NOT NULL,                -- short verb: task.status_changed, client.assigned, etc.
  target_type text,                         -- 'task', 'client', 'sales_rep', 'invoice', etc.
  target_id   text,
  details     jsonb,                        -- before/after, free-form context
  created_at  timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX audit_log_action_idx     ON audit_log(action);
CREATE INDEX audit_log_target_idx     ON audit_log(target_type, target_id);
CREATE INDEX audit_log_created_at_idx ON audit_log(created_at DESC);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on audit_log"
  ON audit_log FOR ALL USING (true) WITH CHECK (true);

-- 3) Watchdog field on build_jobs to track reconciliation
ALTER TABLE build_jobs ADD COLUMN last_reconciled_at timestamp with time zone;

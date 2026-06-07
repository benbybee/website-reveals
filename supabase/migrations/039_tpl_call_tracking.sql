-- Template Site sales: richer call tracking. Reps need to know how many times a
-- prospect has been called and when last, plus a structured outcome on each call
-- (not just free-text notes) so the board can surface call activity at a glance.
--
-- call_count / last_called_at are denormalized rollups on the prospect so the
-- sales board and CRM table can show call activity without aggregating the
-- activity log. `outcome` on the activity row classifies each logged call.

ALTER TABLE tpl_prospects
  ADD COLUMN IF NOT EXISTS call_count     integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_called_at timestamp with time zone;

ALTER TABLE tpl_sales_activity
  ADD COLUMN IF NOT EXISTS outcome text;   -- call outcome: no_answer|voicemail|connected|callback|not_interested|wrong_number

-- Atomic call logger: append the activity row AND bump the prospect's call
-- rollups in one transaction. Doing both in a single function avoids a
-- read-modify-write race when two reps log calls on the same prospect at once.
-- Only `kind = 'call'` flows through here; plain notes still use a direct insert.
CREATE OR REPLACE FUNCTION tpl_log_call(
  p_prospect_id uuid,
  p_agent_id    text,
  p_body        text,
  p_outcome     text
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO tpl_sales_activity (prospect_id, agent_id, kind, body, outcome)
    VALUES (p_prospect_id, p_agent_id, 'call', p_body, p_outcome)
    RETURNING id INTO v_id;

  UPDATE tpl_prospects
    SET call_count     = call_count + 1,
        last_called_at = now()
    WHERE id = p_prospect_id;

  RETURN v_id;
END;
$$;

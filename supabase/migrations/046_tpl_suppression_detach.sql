-- Suppression v2: a suppressed lead is no longer ASSOCIATED with a campaign.
-- On suppress we detach campaign_id (preserving the origin so restore can
-- re-attach) and recompute the origin campaign's tallies so the campaign stats
-- stop counting suppressed leads. Atomic, via RPCs (same pattern as tpl_log_call).

ALTER TABLE tpl_prospects
  ADD COLUMN IF NOT EXISTS suppressed_from_campaign_id uuid;  -- origin campaign while detached (restore + provenance)

CREATE INDEX IF NOT EXISTS tpl_prospects_suppressed_from_idx
  ON tpl_prospects(suppressed_from_campaign_id) WHERE suppressed_from_campaign_id IS NOT NULL;

-- Recompute a campaign's qualified/incomplete tallies from its CURRENTLY-ATTACHED
-- prospects. Suppressed leads have campaign_id = NULL, so they fall out for free.
-- Mirrors the enrich rollup (src/trigger/templates/enrich.ts).
CREATE OR REPLACE FUNCTION tpl_recompute_campaign_counts(p_campaign_id uuid)
RETURNS void LANGUAGE sql AS $$
  UPDATE tpl_campaigns c SET
    qualified_count  = (SELECT count(*) FROM tpl_prospects p WHERE p.campaign_id = p_campaign_id AND p.stage = 'qualified'),
    incomplete_count = (SELECT count(*) FROM tpl_prospects p WHERE p.campaign_id = p_campaign_id AND p.stage = 'incomplete'),
    updated_at = now()
  WHERE c.id = p_campaign_id;
$$;

-- Suppress prospects by id: detach from the campaign (preserving origin), stamp
-- suppression, drop mail_ready, then recompute each origin campaign's counts.
-- Idempotent: already-suppressed rows are skipped. Returns the number suppressed.
CREATE OR REPLACE FUNCTION tpl_suppress_prospects(p_ids uuid[], p_by text, p_reason text)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE
  affected uuid[];
  n int;
  cid uuid;
BEGIN
  SELECT array_agg(DISTINCT campaign_id) INTO affected
  FROM tpl_prospects
  WHERE id = ANY(p_ids) AND suppressed_at IS NULL AND campaign_id IS NOT NULL;

  UPDATE tpl_prospects SET
    suppressed_at = now(),
    suppressed_by = p_by,
    suppression_reason = p_reason,
    suppressed_from_campaign_id = campaign_id,
    campaign_id = NULL,
    mail_ready = false,
    updated_at = now()
  WHERE id = ANY(p_ids) AND suppressed_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;

  IF affected IS NOT NULL THEN
    FOREACH cid IN ARRAY affected LOOP
      PERFORM tpl_recompute_campaign_counts(cid);
    END LOOP;
  END IF;
  RETURN n;
END;
$$;

-- Restore prospects by id: re-attach to their origin campaign, clear suppression,
-- then recompute those campaigns' counts. Returns the number restored.
CREATE OR REPLACE FUNCTION tpl_restore_prospects(p_ids uuid[])
RETURNS int LANGUAGE plpgsql AS $$
DECLARE
  affected uuid[];
  n int;
  cid uuid;
BEGIN
  SELECT array_agg(DISTINCT suppressed_from_campaign_id) INTO affected
  FROM tpl_prospects
  WHERE id = ANY(p_ids) AND suppressed_at IS NOT NULL AND suppressed_from_campaign_id IS NOT NULL;

  UPDATE tpl_prospects SET
    suppressed_at = NULL,
    suppressed_by = NULL,
    suppression_reason = NULL,
    campaign_id = suppressed_from_campaign_id,
    suppressed_from_campaign_id = NULL,
    updated_at = now()
  WHERE id = ANY(p_ids) AND suppressed_at IS NOT NULL;
  GET DIAGNOSTICS n = ROW_COUNT;

  IF affected IS NOT NULL THEN
    FOREACH cid IN ARRAY affected LOOP
      PERFORM tpl_recompute_campaign_counts(cid);
    END LOOP;
  END IF;
  RETURN n;
END;
$$;

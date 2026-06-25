-- Top-of-funnel logging for the /join "claim your site" flow. tpl_prospect_lookups
-- only records the LAST two steps (zip-confirm 'resolved' + site-view 'clicked'),
-- both prospect-specific. This table captures the steps BEFORE that — a raw page
-- visit and a name search — which aren't tied to a single prospect. Together they
-- give the full funnel: visit → search → resolved → clicked, so we can tell
-- "nobody arrived" apart from "they arrived but didn't finish".
CREATE TABLE IF NOT EXISTS tpl_join_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         text NOT NULL CHECK (kind IN ('visit','search')),
  query        text,     -- the typed business name (search only), truncated
  result_count integer,  -- matches returned (search only)
  ip           text,
  user_agent   text,
  at           timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tpl_join_events_kind_at_idx ON tpl_join_events(kind, at);

ALTER TABLE tpl_join_events ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Service role full access on tpl_join_events"
    ON tpl_join_events FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

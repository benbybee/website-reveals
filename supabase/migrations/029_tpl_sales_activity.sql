-- Template Site pipeline: call logs / stage transitions / notes per prospect.
-- agent_id is a soft reference to sales_reps (no hard FK — module stays detachable).

CREATE TABLE IF NOT EXISTS tpl_sales_activity (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES tpl_prospects(id) ON DELETE CASCADE,
  agent_id    text,
  kind        text NOT NULL,               -- 'stage_change' | 'note' | 'call'
  from_stage  text,
  to_stage    text,
  body        text,
  created_at  timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX tpl_sales_activity_prospect_idx ON tpl_sales_activity(prospect_id);

ALTER TABLE tpl_sales_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on tpl_sales_activity"
  ON tpl_sales_activity FOR ALL USING (true) WITH CHECK (true);

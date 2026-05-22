-- Sales-rep outcome markers on tasks.
--
-- The rep dashboard gets two new actions per task: "Sold" and "Not Needed".
-- "Sold" sets sales_outcome='sold' and keeps the task visible — the rep
-- and admin both want to see what was won. "Not needed" sets
-- sales_outcome='not_needed' AND sets archived_at=now() so the row drops
-- out of active dashboards (admin can still find it under /admin/archived).
-- Both actions email + Telegram-notify the system admin so they're aware
-- before any cleanup happens.

ALTER TABLE tasks
  ADD COLUMN sales_outcome       text
    CHECK (sales_outcome IN ('sold', 'not_needed')),
  ADD COLUMN sales_outcome_at    timestamp with time zone,
  ADD COLUMN sales_outcome_by    uuid REFERENCES sales_reps(id) ON DELETE SET NULL,
  ADD COLUMN sales_outcome_notes text;

-- Index on outcome so admin dashboards can quickly pull "all sold" or "all
-- not_needed" lists. Partial index keeps it tiny (most tasks have no outcome).
CREATE INDEX tasks_sales_outcome_idx ON tasks(sales_outcome) WHERE sales_outcome IS NOT NULL;

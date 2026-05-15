-- Direct client → sales rep assignment (the authoritative ownership link).
-- form_sessions.sales_rep_id stays as immutable submission history;
-- clients.sales_rep_id is mutable and drives the rep dashboard scope.

ALTER TABLE clients ADD COLUMN sales_rep_id uuid REFERENCES sales_reps(id) ON DELETE SET NULL;
CREATE INDEX clients_sales_rep_id_idx ON clients(sales_rep_id) WHERE sales_rep_id IS NOT NULL;

-- Backfill: for clients linked to a form_session that already has a sales_rep_id,
-- carry that assignment forward.
UPDATE clients c
SET sales_rep_id = fs.sales_rep_id
FROM form_sessions fs
WHERE c.form_session_token = fs.token
  AND fs.sales_rep_id IS NOT NULL
  AND c.sales_rep_id IS NULL;

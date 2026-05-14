-- Billing: capture Claude Code cost per build + invoice tracking
-- Markup (25% on top of actual cost) is applied at display/invoice time;
-- only the actual cost is stored on build_jobs.

ALTER TABLE build_jobs
  ADD COLUMN cost_usd                NUMERIC(10, 4),
  ADD COLUMN input_tokens            INTEGER,
  ADD COLUMN output_tokens           INTEGER,
  ADD COLUMN cache_read_tokens       INTEGER,
  ADD COLUMN cache_creation_tokens   INTEGER;

CREATE TABLE invoices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number  text NOT NULL,                         -- human readable, e.g. INV-2026-05-sales-001
  source          text NOT NULL,                         -- form_data._source, e.g. "sales", "claim-your-site"
  period_year     integer NOT NULL,
  period_month    integer NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  total_amount    numeric(10, 2) NOT NULL,               -- billable total (cost * 1.25 snapshot)
  paid            boolean NOT NULL DEFAULT false,
  paid_at         timestamp with time zone,
  notes           text,
  created_at      timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE build_jobs
  ADD COLUMN invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL;

CREATE INDEX invoices_source_period_idx ON invoices(source, period_year, period_month);
CREATE INDEX invoices_paid_idx          ON invoices(paid);
CREATE INDEX build_jobs_invoice_id_idx  ON build_jobs(invoice_id);
CREATE INDEX build_jobs_cost_idx        ON build_jobs(cost_usd) WHERE cost_usd IS NOT NULL;

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on invoices"
  ON invoices FOR ALL
  USING (true)
  WITH CHECK (true);

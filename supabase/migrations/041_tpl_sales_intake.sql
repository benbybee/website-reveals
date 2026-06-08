-- Sales-agent submissions now land in the Template flow instead of the legacy
-- SiteLaunchr dispatch. Each sales rep gets ONE long-lived "sales" campaign that
-- collects their submitted businesses as prospects. A submission is HELD (stage
-- 'awaiting_template') until a template exists for its industry; the operator then
-- approves + pushes it through the same SL template build → Kura convert pipeline
-- discovery prospects use. No schema for a separate sales pipeline — sales reuses
-- the canonical tpl_prospects record so the data is build-ready on day one.

-- Campaign kind discriminator. Existing rows backfill to 'discovery' (the scrape
-- pipeline); sales-rep campaigns are 'sales'. discover/enrich/push only ever
-- operate on 'discovery' campaigns, so 'sales' campaigns never get auto-scraped.
ALTER TABLE tpl_campaigns ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'discovery';

-- Sales campaigns are keyed to a rep, not an (industry, state) pair, and hold a
-- mix of industries. name is the human label shown in the admin ("Chandler — Sales").
ALTER TABLE tpl_campaigns ADD COLUMN IF NOT EXISTS sales_rep_id uuid;
ALTER TABLE tpl_campaigns ADD COLUMN IF NOT EXISTS name text;

-- Discovery campaigns still require industry_slug (enforced in the create route);
-- sales campaigns leave it NULL because each prospect carries its own industry.
ALTER TABLE tpl_campaigns ALTER COLUMN industry_slug DROP NOT NULL;

-- One sales campaign per rep — the rep's permanent submission bucket.
CREATE UNIQUE INDEX IF NOT EXISTS tpl_campaigns_sales_rep_uniq
  ON tpl_campaigns (sales_rep_id)
  WHERE kind = 'sales' AND sales_rep_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS tpl_campaigns_kind_idx ON tpl_campaigns(kind);

-- Promote the prospect's industry so the operator can slice "every roofing
-- prospect awaiting a template" across all sales campaigns at once. Discovery
-- prospects keep it NULL (their industry lives on the campaign).
ALTER TABLE tpl_prospects ADD COLUMN IF NOT EXISTS industry_slug text;
CREATE INDEX IF NOT EXISTS tpl_prospects_industry_idx
  ON tpl_prospects(industry_slug)
  WHERE industry_slug IS NOT NULL;

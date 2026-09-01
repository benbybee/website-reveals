-- Gap 1/4: which tpl_industries currently have a LIVE SiteLaunchr template.
-- Drives the rep instant-preview picker (only ready industries are offered) and
-- a pre-dispatch coverage guard (WR never ships a slug SL has no template for).
-- tpl_industries is hereby the single canonical taxonomy for template BUILDING
-- (lib/industries.ts is inbound-form references only — see registry.ts).
--
-- RLS note: tpl_industries already has RLS enabled + a service-role-only policy
-- (migration 024). This is an operator-controlled reference table (no per-user
-- rows), so the added column needs no ownership column or new policy.
ALTER TABLE tpl_industries ADD COLUMN IF NOT EXISTS sl_template_ready boolean NOT NULL DEFAULT false;

-- Seed the industries SL serves reliably today. As SL Builder ships more
-- (garage-door, roofing, fencing, ...), flip each with a one-line UPDATE — that
-- is the coordinated-deploy switch (ADR 0007). Idempotent.
UPDATE tpl_industries SET sl_template_ready = true
  WHERE slug IN ('hvac', 'landscaping', 'pool-service');

-- Industry-based reference URL system.
--
-- Replaces the per-submission "inspiration_sites" textarea (which sales reps
-- weren't filling out) with an admin-managed catalog tied to a fixed set of
-- industry slugs hardcoded in lib/industries.ts. On a /sales submission the
-- submit-route looks up the active references for the chosen industry and
-- writes them into form_data.inspiration_sites before the SL mapper runs, so
-- nothing downstream of the mapper needs to change.
--
-- "Other" submissions take a free-text industry from the rep. industry_aliases
-- lets admin teach the system that e.g. "dental" → health_wellness, so future
-- "Other → dental" entries auto-map to the right reference set. Every Other
-- submission gets a row in industry_other_log for admin review — both
-- auto_mapped and pending — so recurring patterns surface that warrant a
-- new top-level category.

CREATE TABLE industry_references (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  industry_slug  text NOT NULL,
  url            text NOT NULL,
  label          text,
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamp with time zone NOT NULL DEFAULT now(),
  updated_at     timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX industry_references_slug_idx ON industry_references(industry_slug) WHERE active = true;

ALTER TABLE industry_references ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on industry_references"
  ON industry_references FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE industry_aliases (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  industry_slug   text NOT NULL,
  -- Stored lowercased; submit-route matches against LOWER(other_text).
  alias_keyword   text NOT NULL,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(industry_slug, alias_keyword)
);
CREATE INDEX industry_aliases_keyword_idx ON industry_aliases(alias_keyword) WHERE active = true;

ALTER TABLE industry_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on industry_aliases"
  ON industry_aliases FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE industry_other_log (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_token              uuid REFERENCES form_sessions(token) ON DELETE CASCADE,
  raw_text                text NOT NULL,
  -- Slug the alias matcher resolved to (or null if no alias hit).
  resolved_industry_slug  text,
  -- 'auto_mapped'  — an alias matched at submit time. Shows in queue for
  --                  confirmation; admin can promote to 'admin_mapped'.
  -- 'admin_mapped' — admin reviewed and confirmed the mapping.
  -- 'pending'      — no alias matched; no refs were applied. Admin reviews.
  -- 'ignored'      — admin decided the entry isn't worth mapping.
  status                  text NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('auto_mapped', 'admin_mapped', 'pending', 'ignored')),
  resolved_at             timestamp with time zone,
  created_at              timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX industry_other_log_status_idx ON industry_other_log(status, created_at DESC);

ALTER TABLE industry_other_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on industry_other_log"
  ON industry_other_log FOR ALL USING (true) WITH CHECK (true);

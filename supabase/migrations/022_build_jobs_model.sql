-- Track the Anthropic model SL used for each build. Needed so cost_usd can
-- be recomputed accurately from input_tokens / output_tokens / cache_*_tokens
-- when SL starts sending per-build usage in its callback payload — model
-- determines the per-MTok price tier.

ALTER TABLE build_jobs ADD COLUMN model text;

-- Index only the populated rows so we can quickly find which models we have
-- usage for once SL starts sending the field.
CREATE INDEX build_jobs_model_idx ON build_jobs(model) WHERE model IS NOT NULL;

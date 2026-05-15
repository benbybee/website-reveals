-- SiteLaunchr integration: extend build_jobs to support SL pipeline + callback fields
-- The same build_jobs row holds either a Claude-Code-on-VPS build (pipeline='claude-code')
-- or a SiteLaunchr build (pipeline='sitelaunchr'). Status is driven by SL callbacks for
-- the latter.

ALTER TABLE build_jobs
  ADD COLUMN pipeline           text NOT NULL DEFAULT 'claude-code',
  ADD COLUMN external_id        text,                    -- what we send to SL for idempotency
  ADD COLUMN sl_build_id        text,                    -- what SL returns + uses to call us back
  ADD COLUMN wp_admin_url       text,
  ADD COLUMN kura_project_id    text,
  ADD COLUMN kura_portal_url    text,
  ADD COLUMN github_run_url     text,
  ADD COLUMN cloudways_app_id   text,
  ADD COLUMN sl_phase           text,                    -- queued|running|succeeded|live|failed|kura_push_failed|canceled
  ADD COLUMN sl_phase_at        timestamp with time zone,
  ADD COLUMN sl_running_at      timestamp with time zone,
  ADD COLUMN sl_live_at         timestamp with time zone;

CREATE UNIQUE INDEX build_jobs_sl_build_id_idx ON build_jobs(sl_build_id) WHERE sl_build_id IS NOT NULL;
CREATE INDEX build_jobs_external_id_idx       ON build_jobs(external_id) WHERE external_id IS NOT NULL;
CREATE INDEX build_jobs_pipeline_idx          ON build_jobs(pipeline);

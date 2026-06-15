# Database / Data Model

> Supabase Postgres, 41 migrations (`supabase/migrations/001…041`). Grouped by domain. Each migration file is the authority for its columns/constraints; this is the map.

## Onboarding
- **`form_sessions`** — `token`, `email`, `current_step`, `form_data` JSONB, `file_urls` JSONB, `sales_rep_id`, `dns_provider`, `submitted_at`, `expires_at`. The questionnaire's durable state.
- Storage bucket **`form-uploads`**.

## Build & billing
- **`build_jobs`** — `token`, `form_type`, `status`, `pipeline` (`claude-code|sitelaunchr`), `sl_build_id`, `external_id`, `sl_phase`/`sl_phase_at`, `site_url`, `wp_admin_url`, `kura_project_id`, `task_id`, `invoice_id`, `cost_usd`, `input_tokens`/`output_tokens`/`cache_*_tokens`, `model`. One row per build attempt.
- **`invoices`** — `invoice_number`, `source`, `period_year`/`month`, `total_amount`, `paid`/`paid_at`. Markup applied at creation ([L5](../loops/billing-invoicing.md)).

## Clients, tasks, sales
- **`clients`** — `email` UNIQUE, `pin_hash`(+`pin`), `form_session_token`, `sales_rep_id`, `website_url`, `github_repo_url`.
- **`tasks`** — `client_id`, `parent_task_id`, `status` (backlog|in_progress|review|blocked|complete), `priority`, `tags[]`, `complexity_score`, `estimated_completion_date`, `completed_at`, `archived_at`, `sales_outcome`(+`_at`/`_by`/`_notes`).
- **`task_comments`** (`author_type` admin|client|system, `is_request`), **`task_status_history`**, **`ai_velocity_log`** (estimation history), **`telegram_conversations`**, **`inbound_proposals`** (`source`, `proposed_task`, `status`), **`pin_login_attempts`** (rate limit).
- **`sales_reps`** — `email` UNIQUE, `pin_hash`(+`pin`), `active`.
- **`audit_log`** — `actor_type`/`actor_id`, `action`, `target_type`/`target_id`, `details`.
- **`notification_settings`** — `audience` PK, `enabled`.

## Industry references
- **`industry_references`** (`industry_slug`, `url`, `label`), **`industry_aliases`** (`alias_keyword` → slug), **`industry_other_log`** ("Other" submission mapping audit).

## Templates / GTM (`tpl_*`, 14 tables)
- **`tpl_industries`** — `slug`, `google_categories[]`, `sl_slug` (the SL template-selection vocabulary — see [C2](../contracts/c2-sitelaunchr-builds-wr-template.md)).
- **`tpl_campaigns`** — `industry_slug`, `state`, `locations` JSONB, `target_count`, `status`, rollup counts, `kind` (discovery|sales), `sales_rep_id`, `mail_provider`, `postcard_design_id`, `return_address_id`.
- **`tpl_prospects`** — `source_id` UNIQUE (`wr-tpl-{place_id}`, the dedup/`external_id`), `record` JSONB (canonical), promoted columns (`business_name`/`city`/`state`/`phone`/`website`/`website_status`), `confidence`, `completeness`, `stage`, `agent_id`, `call_count`, `mail_ready`, `do_not_mail`.
- **`tpl_prospect_assets`** — logo/photo refs with slots, `fetch_verified`.
- **`tpl_cost_events`** — append-only Apify/Firecrawl ledger (`stage`, `actor`, `units`, `usd`, `run_id`).
- **`tpl_sales_activity`** — call logs + stage transitions.
- **`tpl_sl_batches`** — per-push tracking (`batch_id`, `transport`, `status`, `sl_response`).
- **`tpl_postcard_designs`**, **`tpl_return_addresses`** (mail assets; storage bucket `tpl-postcards`).
- **`tpl_mailings`** — `prospect_id` UNIQUE (one card per prospect ever), `status`, `provider`, `lob_id`/`provider_job_id`, `cost_usd`, `qr_token` UNIQUE, `scan_count`, snapshots.
- **`tpl_qr_scans`** — append-only scan log; `tpl_record_qr_scan()` resolves token → preview URL atomically.

## Notes
- RLS minimal (service-role bypass — G-SEC1). Several soft references lack FKs (G-DATA1). Plaintext `pin` columns coexist with `pin_hash` (G-SEC2). Unbounded tables (`pin_login_attempts`, `telegram_conversations`, `tpl_qr_scans`) lack TTL (G-HOUSE1). See [gap matrix](../gap-matrix.md).

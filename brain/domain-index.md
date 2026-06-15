# Domain Index Matrix

> Domain → owning code → data stores → contracts → loops. The fast lookup for "where does X live and what does it touch." Cited from the discovery pass.

| Domain | Owning code | Primary data | Contracts | Loops |
|---|---|---|---|---|
| **Client intake** | `app/api/form/*`, `lib/form-steps.ts`, `lib/resolve-form-type.ts` | `form_sessions`, `form-uploads` | C1 (on submit), C5 | [Intake/onboarding](./loops/intake-onboarding.md) |
| **Build dispatch** | `lib/sitelaunchr.ts`, `lib/sitelaunchr-mapper.ts`, `app/api/form/[token]/submit` | `build_jobs` | C1, C5 | [Build dispatch](./loops/build-dispatch.md) |
| **Build status** | `app/api/sl-callback`, `app/api/templates/sl-callback`, `lib/templates/sl/callbackStatus.ts` | `build_jobs`, `tpl_prospects` | C4 | [Build dispatch](./loops/build-dispatch.md), [Dispatchr lifecycle](./loops/dispatchr-lifecycle.md) |
| **Stuck-build recovery** | `app/api/cron/reconcile-sl-builds`, `app/api/admin/stuck-builds`, `app/api/admin/build/resubmit` | `build_jobs` | C5 | [Stuck-build recovery](./loops/stuck-build-recovery.md) |
| **Tasks / client work** | `app/api/admin/tasks/*`, `lib/tasks.ts`, portal/rep task routes | `tasks`, `task_comments`, `task_status_history` | — | (task lifecycle; see [intake](./loops/intake-onboarding.md)) |
| **AI estimation** | `src/trigger/ai-estimate.ts` | `tasks`, `ai_velocity_log` | Anthropic (vendor) | [AI wizard / generation](./loops/ai-wizard-generation.md) |
| **AI intake & approval** | Slack/email/Telegram webhook routes, `lib/ai-wizard-prompt.ts` | `inbound_proposals`, `telegram_conversations` | Anthropic, Slack, Telegram (vendor) | [AI wizard / generation](./loops/ai-wizard-generation.md), [Notification](./loops/notification.md) |
| **Notifications** | `lib/task-emails.ts`, `lib/slack.ts`, Telegram send | `notification_settings` | Resend, Telegram (vendor) | [Notification](./loops/notification.md) |
| **Campaign discovery** | `src/trigger/templates/discover.ts` | `tpl_campaigns`, `tpl_prospects`, `tpl_cost_events` | Apify (vendor) | [Ingestion / scrape](./loops/ingestion-scrape.md) |
| **Enrichment** | `src/trigger/templates/enrich.ts`, `lib/templates/enrich/*` | `tpl_prospects`, `tpl_prospect_assets`, `tpl_cost_events` | Apify, Firecrawl (vendor) | [Ingestion / scrape](./loops/ingestion-scrape.md) |
| **Qualification gate** | `lib/templates/score/gate.ts` | `tpl_prospects.completeness/stage` | — | [Ingestion / scrape](./loops/ingestion-scrape.md) |
| **SL push (GTM)** | `lib/templates/sl/push.ts`, `adapter.ts`, `toBuildPayload.ts`, `app/api/templates/campaigns/[id]/push` | `tpl_sl_batches`, `tpl_prospects` | C2, C4 | [Build dispatch](./loops/build-dispatch.md) |
| **Conversion (Kura handoff)** | `lib/templates/sl/convert.ts`, `app/api/templates/prospects/[id]/convert` | `tpl_prospects` | C3 | [Build dispatch](./loops/build-dispatch.md) |
| **Direct mail** | `src/trigger/templates/mail-campaign.ts`, `lib/templates/mail/*`, `app/api/templates/campaigns/[id]/mail` | `tpl_mailings`, `tpl_postcard_designs`, `tpl_return_addresses` | Lob, Click2Mail (vendor) | [Build dispatch](./loops/build-dispatch.md) (mail arm) |
| **QR / scans** | `app/r/[token]`, `tpl_record_qr_scan()` | `tpl_qr_scans`, `tpl_mailings` | — | [Notification](./loops/notification.md) (attribution) |
| **Sales activity** | `app/api/templates/sales/activity`, `lib/templates/salesIntake.ts` | `tpl_sales_activity`, `tpl_campaigns` (sales kind) | — | [Intake/onboarding](./loops/intake-onboarding.md) (sales arm) |
| **Billing** | `lib/billing.ts`, `lib/anthropic-pricing.ts`, `app/api/admin/billing/*` | `build_jobs.cost_usd`, `invoices` | C4 (cost fields) | [Billing / invoicing](./loops/billing-invoicing.md) |
| **Auth / identity** | `lib/admin-auth.ts`, `lib/portal-auth.ts`, `lib/sales-rep-auth.ts`, `lib/pin.ts`, `middleware.ts` | `clients`, `sales_reps`, `pin_login_attempts` | — | — |
| **Lifecycle observability** | `lib/dispatchr-webhook.ts` | (events only) | C5 | [Dispatchr lifecycle](./loops/dispatchr-lifecycle.md) |

# Loop Register

> Every closed-loop process in WR, with its evaluator and escalation at a glance. Governed by the [Loop Engineering Constitution](./standards/loop-engineering-constitution.md). Full detail per loop in [`loops/`](./loops/). A loop whose evaluator is **NONE** is an open loop and appears in the [gap matrix](./gap-matrix.md).

| # | Loop | Executor | Evaluator (level) | Retry | Escalation / gate | Observability | Detail |
|---|---|---|---|---|---|---|---|
| L1 | **Intake / onboarding** | `form/[token]/submit` → build dispatch | submission completeness + SL accept (L2) | SL idempotent on `external_id` | failed dispatch → admin (stuck-builds); sales arm holds for template | `form_sessions`, `build_jobs`, Dispatchr | [↗](./loops/intake-onboarding.md) |
| L2 | **Ingestion / scrape→enrich→qualify** | `tpl-discover` → `tpl-enrich`/`-batch` | `scoreRecord()` gate (L2) | per-prospect best-effort; claim-stale orphan recovery | whole-batch failure → campaign `status=error` | `tpl_prospects.stage`, `tpl_cost_events`, task logs | [↗](./loops/ingestion-scrape.md) |
| L3 | **Build dispatch** (both spines + mail) | `dispatchBuild` / `pushBuilds` / `postConversion` / mail send | response gate + `validateBuildPayload`/`validateConversionInput`; Lob deliverability (L2) | 429 retry-after ×3 (C2); idempotent dedup | per-build isolated; failed build → operator; conversion retryable → manual re-fire | `tpl_sl_batches`, `build_jobs`, `BuildResult` | [↗](./loops/build-dispatch.md) |
| L4 | **Dispatchr lifecycle events** | `notifyDispatchr` | **NONE** (fire-and-forget) | **none** | **none** (silent swallow) | console log only | [↗](./loops/dispatchr-lifecycle.md) |
| L5 | **Billing / invoicing** | `sl-callback` cost capture → `billing/invoices` | cost present on `phase=live`; markup applied (L1) | duration-estimate fallback | none (admin creates invoices manually) | `build_jobs.cost_usd`, `invoices` | [↗](./loops/billing-invoicing.md) |
| L6 | **AI wizard / generation** | `ai-estimate`; inline Claude in intake/Telegram | admin Telegram approve/reject (L2 human); estimate eval = **NONE** | none (fire-and-forget) | Telegram to admin; unclassified still surfaced | `inbound_proposals.status`, `ai_velocity_log` | [↗](./loops/ai-wizard-generation.md) |
| L7 | **Notification** | `task-emails`, Telegram, QR scan attribution | audience-enabled gate (L1) | none (errors suppressed, 200 OK) | none | `notification_settings`, `tpl_qr_scans` | [↗](./loops/notification.md) |
| L8 | **Stuck-build recovery** | `cron/reconcile-sl-builds`, `admin/stuck-builds`, `build/resubmit` | age + phase query (L2) | resubmit creates fresh `build_jobs` | Telegram + Dispatchr `build.stuck`; admin resubmits | `build_jobs`, Dispatchr | [↗](./loops/stuck-build-recovery.md) |

## Reading the register
- **Evaluator level** cites the [Evaluator Standard](./standards/evaluator-standard.md): L0 none, L1 structural, L2 semantic, L3 adversarial.
- **L4 (Dispatchr)** is the clearest open loop: observability-only by design ([Pattern P4](./standards/pattern-library.md)) — acceptable for an observability feed, but it means events can be lost. Tracked as G-C5.
- **L6 estimate** and **L7** have human/audience gates but no automated quality evaluator on the AI output itself — tracked as G-AI2.

## Runtime-state mapping
Each loop's work item maps onto the canonical states in the [Runtime Loop Standard](./standards/runtime-loop-standard.md):
- L2 prospects: `scraped`→pending, `enriching`→running (claim), `qualified`→succeeded, `incomplete`→held, `error` campaign→escalated.
- L3 builds: `queued|running`→running, `live`/`succeeded`→succeeded, `build_failed`→failed.
- L1 tasks: `backlog`→pending, `in_progress`→running, `review`→evaluating (human gate), `complete`→succeeded, `blocked`→held/escalated.

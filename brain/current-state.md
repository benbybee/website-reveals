# Current State — Website Reveals

> Snapshot as of the bootstrap (2026-06-11). "True now," grounded in the code. Update via `/update-brain` when material change lands.

## One-paragraph reality
WR runs two parallel businesses on one codebase: (1) an **inbound** path where a client fills a questionnaire and WR dispatches an automated website build to SiteLaunchr, tracks it through callbacks, manages the resulting work as tasks, and bills it; and (2) an **outbound Template Site GTM** path where WR scrapes businesses, enriches them (brand DNA + Facebook), scores them against a qualification gate, pushes the qualified ones to SiteLaunchr as speculative preview sites, mails postcards with QR codes, tracks calls/scans, and — when a prospect says yes — fires a conversion that promotes the build into Kura. Admin, client, and sales-rep roles each have their own PIN/JWT-gated surface.

## Platform facts
- **App:** Next.js App Router. ~95 API routes across 11 subsystems. `middleware.ts` + `lib/admin-auth` / `portal-auth` / `sales-rep-auth` gate access.
- **Background:** 8 Trigger.dev v3 tasks (`ai-estimate`, `ai-process-inbound`*, `ai-telegram-command`*, `tpl-discover`, `tpl-enrich`, `tpl-enrich-batch`, `tpl-deep-audit`, `tpl-backfill`, `tpl-mail-campaign`) + 3 Vercel crons (`reconcile-sl-builds`, `notify-abandoned-submissions`, `archive-completed-tasks`). *`ai-process-inbound` and `ai-telegram-command` are defined but **not dispatched** — inbound is handled inline in webhook routes (see gap matrix G-AI1).
- **Data:** Supabase Postgres, 41 migrations. Service-role server-side; RLS minimal (service-role bypass — gap G-SEC1). Storage buckets: `form-uploads`, `tpl-postcards`.
- **Deploy:** Vercel auto-deploy on push to `main`; Trigger.dev via pinned CLI.

## Subsystems (11)
Onboarding & Intake · External Webhooks & Callbacks · Auth & Sessions · Admin Dashboard · Client Portal · Sales-Rep Portal · Website Build Pipeline · AI Wizard & Notifications · Template Site GTM (the `tpl_*` system) · Industry References · Billing. See the [subsystem map](./subsystem-map.md).

## Distributed seams (Tier 3) — current status
| Seam | Status |
|---|---|
| C1 SL `/api/builds` (`wr`) | active |
| C2 SL `/api/builds` (`wr-template`) | active; transport `post` or `table` |
| C3 SL `/api/conversions` (Kura handoff) | active; retryable outcomes re-fired manually |
| C4 SL → WR callbacks | active for status; **cost fields awaiting SL** (G-C4) |
| C5 WR → Dispatchr lifecycle | active; **fire-and-forget, no delivery guarantee** (G-C5) |

## Recently changed (this repo's recent history)
- **Enrich fan-out** (`tpl-enrich` → `tpl-enrich-batch`): the enrich step was refactored from one sequential run into a parent that fans out bounded child batches (size 5, concurrency 5) with claim-stale orphan recovery, so large campaigns can't hit the task duration limit. See [ADR 0003](./decisions/0003-enrich-fan-out.md).
- **DNA + address clean-list filters** for the prospect CRM/export, with single-source record edits (drawer edits now mirror into the canonical `record`). See [ADR 0004](./decisions/0004-prospect-filters-single-source.md).
- **Single-state campaigns** + full-control re-run; sales-rep submissions routed into the Template flow and held for template.

## Active known risks (top)
- C5 Dispatchr events can be silently lost (no durable delivery).
- Real build-cost attribution blocked on SL emitting cost fields (C4); `cost_usd` is a clamped duration estimate meanwhile.
- Two AI Trigger tasks are dead code (inline handlers superseded them).
- RLS is service-role-only; a stray anon key would have no DB-level guard.
See the full [gap matrix](./gap-matrix.md).

## What is NOT here
- No payment/Stripe gate on conversion in v1 (operator decision — [ADR 0005](./decisions/0005-no-payment-gate-v1.md)).
- No direct WR→Kura API; Kura is reached only through SL `/api/conversions`.

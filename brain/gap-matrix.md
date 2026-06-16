# Gap Matrix

> Known missing evaluators, gates, escalations, and conformance checks. **The bootstrap documents gaps; it does not fix product code.** Each gap has an ID, severity, and the loop/contract it belongs to. Surfaced by the discovery pass (treating code as reality).

Severity: **High** = correctness/money/data-loss risk on a normal path · **Med** = degraded behavior or manual toil · **Low** = hygiene/observability.

## Contract gaps
| ID | Sev | Gap | Where | Note |
|---|---|---|---|---|
| G-C5 | High | Dispatchr events are fire-and-forget: 3s timeout, errors swallowed, **no retry, no durable delivery, no escalation** — events can be silently lost. | [C5](./contracts/c5-dispatchr-lifecycle.md) | Acceptable for observability ([P4]) but Mission Control can miss lifecycle events. No dead-letter. |
| G-C4 | High | Real build-cost attribution blocked on SL emitting `cost_usd`/`usage`. Until then `build_jobs.cost_usd` is a clamped duration estimate (~$8.80 flat on long builds). | [C4](./contracts/c4-sitelaunchr-callbacks.md) | Cost contract documented; SL side not shipped. |
| ~~G-C4-2~~ | ✅ Closed | A dropped terminal callback stranded a `wr-template` lead (no template-flow reconcile; WR couldn't pull `site_url` from SL). **Closed 2026-06-16:** SL shipped `GET /api/builds/:id`; WR shipped `reconcile-template-builds` (pulls authoritative status + url, applies what the dropped callback would have). Verified end-to-end on the real stranded build (Zap/`3c78c4bc`) → recovered to `live` + claimable in `/join`. | [C4](./contracts/c4-sitelaunchr-callbacks.md) | [ADR 0006](./decisions/0006-template-callback-reconciliation.md). Callbacks remain the fast path; cron is the backstop. |
| G-C3 | Med | Retryable conversion outcomes (`build_not_ready`, 429/5xx, network) have **no automated retry loop** — a human re-fires. Conversion POST is synchronous in the route (blocks the HTTP response). | [C3](./contracts/c3-sitelaunchr-conversions.md) | Idempotent on `external_id`, so safe to re-fire. |
| G-C2 | Med | No automated SL-side conformance probe; `brief.industry` must match an SL template slug (vocabulary now documented in [C2](./contracts/c2-sitelaunchr-builds-wr-template.md)). No WR pre-dispatch industry gate yet (would catch truly-unsupported industries). | [C2](./contracts/c2-sitelaunchr-builds-wr-template.md) | Failure feedback improved: SL now synthesizes `error_message` on null-reason failures (PR #7). |
| ~~G-C2c~~ | ✅ Closed | Worker fill-schema overflow (`hvac-precision-comfort` → non-retryable `AI_APICallError 400` "too many states"). PR #3 was insufficient (and a stale build ran old `main`). **Closed 2026-06-16:** sitelaunchr-builder PR (merge `745a273`) does true per-page chunking + opaque short keys (`f0…`), drops the icon enum and `minLength`, with a text-mode fallback; schema 3.1 KB. Verified on a real paid build — REIC HVAC built a complete 8-page site → `live`. | [C2](./contracts/c2-sitelaunchr-builds-wr-template.md) | Industry IS supported. error_message synthesis (PR #7) also verified to WR `build_error`. |
| G-C2e | Med | **SL template content not fully derived from the business:** the speculative site ships template-default placeholders — service-area page (and testimonials) list invented towns not in the business's metro (REIC: "Springfield/Riverton/…" not Denver), empty blog despite homepage teasers, empty `mailto:`/contact email, sparse LocalBusiness JSON-LD (name only). Worker/template (sitelaunchr-builder) content-gen gap; observed on REIC HVAC build 2026-06-16. Undercuts the "we built YOUR site" pitch. | [C2](./contracts/c2-sitelaunchr-builds-wr-template.md) | Build IS complete + on-brand; defects are content-fill, not render. Some inputs (email, service area) WR could also supply in `brief`. |
| ~~G-C2d~~ | ✅ Closed | **Failed builds are now retryable.** Was: re-POST of a terminal-`failed` `external_id` returned the cached failure, stranding the lead. **Closed 2026-06-16:** SL added opt-in `retry:true` (re-POST re-arms the `failed` build in place — same `build_id`, refreshed brief, cleared prior terminal output); WR `dispatch-one --retry` sends it. Verified: REIC rebuilt → `live`. | [C2](./contracts/c2-sitelaunchr-builds-wr-template.md) | A deduped `failed` response now also carries `retryable:true`. |
| G-C1 | Low | No schema-level dry-run against SL before a real onboarding dispatch. | [C1](./contracts/c1-sitelaunchr-builds-wr.md) | Relies on SL reject. |

## Loop gaps
| ID | Sev | Gap | Loop |
|---|---|---|---|
| G-L4 | High | Dispatchr loop has no evaluator and no escalation (same root as G-C5). | L4 |
| G-AI1 | Med | `ai-process-inbound` and `ai-telegram-command` Trigger tasks are **defined but never dispatched** — inline webhook handlers superseded them (dead code / incomplete refactor). | L6 |
| G-AI2 | Med | AI task estimates and AI-proposed tasks have a human approval gate but **no automated quality evaluator** on the model output; estimate accuracy is logged (`ai_velocity_log`) but never scored back. | L6 |
| G-BUD1 | Med | No max-cost/budget gate per campaign. A misconfigured campaign (high `target_count` × many locations) can incur unbounded Apify spend; cost events are recorded **post-facto**, so an interrupted run may not record cost at all. | L2 |
| G-MAIL1 | Med | Partial mail send (e.g. 50/100 then timeout) persists partial state but has no automated "resume from mailing status" recovery — manual. | L3 (mail arm) |
| G-EST1 | Low | `estimateBuildCost` uses random jitter without a persisted seed, so recomputing cost from duration yields a different value each time. | L5 |
| G-NOTIF1 | Low | Notification loop suppresses all errors and returns 200; a failed client email is invisible. | L7 |
| G-TG1 | Low | Telegram approval commands run synchronously inline in the webhook; a slow Dispatchr POST or DB write can time out the webhook. No concurrency control on duplicate `approve` commands. | L6 |

## Cross-cutting gaps
| ID | Sev | Gap |
|---|---|---|
| G-SEC3 | Med | **Vercel cron endpoints run unauthenticated in prod:** `reconcile-sl-builds`, `reconcile-template-builds`, `notify-abandoned-submissions`, `archive-completed-tasks` only enforce `Authorization: Bearer $CRON_SECRET` *when* `CRON_SECRET` is set — and it's unset (verified 2026-06-16: dummy/no Bearer → 200). Anyone can trigger reconciliation churn, Telegram/email sends. Fix: set `CRON_SECRET` in Vercel (routes already enforce; Vercel cron auto-injects it). |
| G-SEC1 | Med | RLS is service-role-only (migration 006 tightening); no DB-level authorization guard if an anon key is ever used. |
| G-SEC2 | Med | Plaintext PIN columns (`clients.pin`, `sales_reps.pin`) exist for admin display alongside `pin_hash`; no auto-clear/TTL. PIN-reset responses return plaintext. |
| G-HOUSE1 | Low | Unbounded-growth tables with no TTL/archival: `pin_login_attempts`, `telegram_conversations`, `tpl_qr_scans`. |
| G-IDEMP1 | Low | Email-inbound webhook has no dedup key (Slack dedups on `message_ts`); duplicate Resend webhooks could create duplicate proposals. |
| G-DATA1 | Low | Several soft references without FKs (`tpl_prospects.agent_id` → reps; `build_jobs.task_id` nullable), so deletes can orphan. |

## How gaps are used
- New work that touches a gap's area should consider closing it (cite the ID in the PR/ADR).
- A gap is closed only when its evaluator/gate/escalation/check actually exists in code AND the brain is updated. Run `/brain-health` to confirm no closed gap silently regressed.
- The bootstrap did **not** modify product code to close any gap; these are documentation of reality.

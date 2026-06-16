# Gap Matrix

> Known missing evaluators, gates, escalations, and conformance checks. **The bootstrap documents gaps; it does not fix product code.** Each gap has an ID, severity, and the loop/contract it belongs to. Surfaced by the discovery pass (treating code as reality).

Severity: **High** = correctness/money/data-loss risk on a normal path · **Med** = degraded behavior or manual toil · **Low** = hygiene/observability.

## Contract gaps
| ID | Sev | Gap | Where | Note |
|---|---|---|---|---|
| G-C5 | High | Dispatchr events are fire-and-forget: 3s timeout, errors swallowed, **no retry, no durable delivery, no escalation** — events can be silently lost. | [C5](./contracts/c5-dispatchr-lifecycle.md) | Acceptable for observability ([P4]) but Mission Control can miss lifecycle events. No dead-letter. |
| G-C4 | High | Real build-cost attribution blocked on SL emitting `cost_usd`/`usage`. Until then `build_jobs.cost_usd` is a clamped duration estimate (~$8.80 flat on long builds). | [C4](./contracts/c4-sitelaunchr-callbacks.md) | Cost contract documented; SL side not shipped. |
| G-C4-2 | High | A dropped terminal callback strands a `wr-template` lead forever: no reconciliation for `tpl_prospects` (the `wr` flow has `reconcile-sl-builds`; the template flow has none), and WR can't pull `site_url` from SL (`dispatchBuild` returns status only). Proven 2026-06-16: SL build `succeeded` but the lead stayed `building`, invisible to `/join`. | [C4](./contracts/c4-sitelaunchr-callbacks.md) | [ADR 0006](./decisions/0006-template-callback-reconciliation.md) accepted. **WR side built** (`reconcile-template-builds` cron + `readBuild`); SL built the `GET /api/builds/:id` read path. **Closes on coordinated deploy** of both sides (+ Zap recovered). |
| G-C3 | Med | Retryable conversion outcomes (`build_not_ready`, 429/5xx, network) have **no automated retry loop** — a human re-fires. Conversion POST is synchronous in the route (blocks the HTTP response). | [C3](./contracts/c3-sitelaunchr-conversions.md) | Idempotent on `external_id`, so safe to re-fire. |
| G-C2 | Med | No automated SL-side conformance probe; `brief.industry` must EXACT-match an SL template slug or the build fails with no WR-side feedback loop. Failed builds have no escalation/dead-letter. | [C2](./contracts/c2-sitelaunchr-builds-wr-template.md) | Relies on local validator + SL `.strict()`. |
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
| G-SEC1 | Med | RLS is service-role-only (migration 006 tightening); no DB-level authorization guard if an anon key is ever used. |
| G-SEC2 | Med | Plaintext PIN columns (`clients.pin`, `sales_reps.pin`) exist for admin display alongside `pin_hash`; no auto-clear/TTL. PIN-reset responses return plaintext. |
| G-HOUSE1 | Low | Unbounded-growth tables with no TTL/archival: `pin_login_attempts`, `telegram_conversations`, `tpl_qr_scans`. |
| G-IDEMP1 | Low | Email-inbound webhook has no dedup key (Slack dedups on `message_ts`); duplicate Resend webhooks could create duplicate proposals. |
| G-DATA1 | Low | Several soft references without FKs (`tpl_prospects.agent_id` → reps; `build_jobs.task_id` nullable), so deletes can orphan. |

## How gaps are used
- New work that touches a gap's area should consider closing it (cite the ID in the PR/ADR).
- A gap is closed only when its evaluator/gate/escalation/check actually exists in code AND the brain is updated. Run `/brain-health` to confirm no closed gap silently regressed.
- The bootstrap did **not** modify product code to close any gap; these are documentation of reality.

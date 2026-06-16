# 0006 — Reconciliation backstop for missed wr-template build callbacks

- Status: proposed
- Date: 2026-06-16
- Deciders: WR maintainer, operator; SiteLaunchr maintainer (cross-repo half)
- Tier impact: none
- Contracts touched: [C4](../contracts/c4-sitelaunchr-callbacks.md) (SL→WR callbacks), [C2](../contracts/c2-sitelaunchr-builds-wr-template.md) (wr-template builds)

## Context
End-to-end test on 2026-06-16 (a real build for `external_id = wr-tpl-ChIJQ-2wFmuBS4cReF0ZCRJm1Cg`, `build_id = 3c78c4bc-f422-4f61-92b2-d5a98ae88314`):

- WR dispatched the lead; SL accepted (`202 queued`).
- An early `queued/running` callback **landed** (prospect → `stage=building`, `sl_build_id` set) — so the SL→WR callback channel and HMAC verification work.
- SL **completed the build successfully** — confirmed independently: a dedup re-POST to `/api/builds` returns `{ status: "succeeded", duplicate: true }`.
- But the **`succeeded` callback never reached/updated WR**. 30+ minutes later the prospect was still `stage=building`, `preview_url = null`, and was therefore invisible to the public `/join` flow (which gates on `preview_url`).

WR's handler is **not** at fault: a Tier-1 control — a correctly signed `succeeded` callback — drives `building→live`, populates `preview_url`/`sl_build_id`, and makes the lead searchable + ZIP-confirmable in `/join`. The failure is **delivery of one terminal callback**, plus the **absence of any backstop**:

1. **C4 doctrine places delivery entirely on SL** ("Retry is SL's responsibility; WR is idempotent"). This test proves that is insufficient: one dropped terminal callback strands the lead permanently, with no WR-side signal.
2. **The wr-template flow has no reconciliation.** The `wr` onboarding flow has `app/api/cron/reconcile-sl-builds/route.ts` (2-hourly scan for `build_jobs` stuck in `building`). There is **no equivalent** scanning `tpl_prospects`.
3. **WR cannot pull the result.** `lib/sitelaunchr.ts` `dispatchBuild` returns `{ build_id, status, duplicate }` only — the dedup re-POST surfaces `status` but **never `site_url`**. So even knowing the build succeeded, WR has no way to obtain the preview URL without the callback.

Net effect: a successfully built, billable site silently fails to surface in the GTM funnel.

## Decision
Treat SL callbacks as the **fast path, not the only path**, and add a **reconciliation backstop** for the wr-template flow. This is a coordinated, additive, two-repo change:

1. **SL side (C4/C2 addition) — a pull path for terminal build state.** SL exposes a read returning `{ status, site_url, error_message }` for a build, keyed by `build_id` (preferred) or `external_id`:
   - **(a)** `GET /api/builds/:build_id` (or `?external_id=…`) — **preferred**: an explicit read seam, reusable, doesn't overload the dispatch write; or
   - **(b)** include `site_url` in the existing `/api/builds` dedup response when `status` is terminal.
2. **WR side — a template reconcile cron** `app/api/cron/reconcile-template-builds/route.ts` (mirrors `reconcile-sl-builds`, guarded by `CRON_SECRET`): every ~30 min, find `tpl_prospects` where `stage='building'` and `updated_at` is older than a threshold (≥ SL's 18-min target + margin, e.g. 25 min); call the SL read path by `sl_build_id`; then apply exactly what the callback would have, via the same `slStatusToStage` mapping — `succeeded` → write `preview_url` + flip `live`; `failed|canceled` → `build_failed` + `build_error`. Idempotent; safe to run repeatedly.

Callbacks stay primary (low latency); the cron acts only on builds the callback missed. WR remains idempotent on `(build_id, status)`.

## Consequences
- **Easier:** a dropped callback no longer strands a lead — the funnel self-heals within one reconcile interval, and `/join` eventually surfaces every successfully-built site. Closes **G-C4-2**; narrows **G-C2** (failed builds gain an escalation path).
- **New surface / harder:** one SL read endpoint + one WR cron + a `vercel.json` schedule. Cross-repo coordination required: this ADR → `/cross-repo-review` → coordinated deploy.
- **Amends C4:** "Retry is SL's responsibility" is superseded by "callbacks are best-effort fast-path; WR reconciles as the backstop." C4's *Failure/retry/escalation* section and the C2/C4 change-protocol notes must be updated on acceptance.
- **Accepted interim debt (until SL ships the read path):** WR cannot auto-recover; recovery is **manual** — the operator obtains `site_url` from SL and WR applies it (signed-callback replay or direct write). Tracked as **G-C4-2** until the cron exists in code.
- **Must revisit:** the reconcile threshold/interval against SL's real p95 build time; whether the cron should also re-drive builds stuck in `queued` (never started) vs only `building`.

## Alternatives considered
- **Status quo — trust SL callback retries only.** Rejected: this test proved a terminal callback can be lost with no WR visibility and no recovery; a real, built, billable site silently drops out of the funnel.
- **WR re-dispatch (dedup) to read status, no new SL endpoint.** Partial: the dedup re-POST already returns `status` (enough to *detect* "succeeded") but **not `site_url`**, so WR still can't populate `preview_url`. Viable as the cron's "is it done?" probe **only if** SL also adds `site_url` to the dedup response (option 1b). Insufficient alone.
- **Manual operator recovery as the permanent answer.** Rejected as the durable solution (doesn't scale, error-prone, invisible). Kept only as the interim bridge until the read path ships.
- **Require SL to guarantee exactly-once callback delivery (durable queue/dead-letter on SL).** Rejected as WR's sole dependency: even with stronger SL delivery, WR should not be unable to observe its own pipeline. An independent pull is the durable, decoupled backstop; SL hardening delivery is complementary, not a substitute.

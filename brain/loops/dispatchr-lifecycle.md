# L4 — Dispatchr Lifecycle Event Loop

> The clearest **open loop** in WR. It is observability-only by design, but that design means events can be lost. Tracked as G-C5 / G-L4.

**Goal:** Let Dispatchr (Ben's Mission Control) observe WR's intake/build lifecycle without polling the database.

**Executor:** `notifyDispatchr(event)` ([`lib/dispatchr-webhook.ts`](../../lib/dispatchr-webhook.ts)) — one `POST` per event to `$WEBSITEREVEALS_DISPATCHR_WEBHOOK_URL` with `x-wr-webhook-secret`. Events: `submission.new`, `build.dispatched`, `build.live`, `build.failed`, `build.stuck`, `submission.abandoned`. Contract: [C5](../contracts/c5-dispatchr-lifecycle.md).

**Evaluator:** **NONE.** The call checks `res.ok` only to log; it never decides anything or changes WR state.

**Retry:** **none.** 3s `AbortController` timeout; any error is `console.warn`-ed and swallowed. Missing env = silent no-op.

**Escalation:** **none.** A down Dispatchr means lost events with no dead-letter, no queue, no alert.

**Approval gate:** n/a (outbound observability).

**Observability:** console logs only (`[dispatchr] <event> delivered|failed`). There is no record in the DB of which events were sent or dropped.

**Runtime states:** n/a — fire-and-forget, no tracked work item.

**Why it's shaped this way:** [Pattern P4](../standards/pattern-library.md) (fire-and-forget observability notify) — the caller `await`s but never has to think about delivery, mirroring the Telegram/Resend pattern. This is an accepted trade-off for an *observability* feed, NOT for a state-changing seam.

**Gap & remedy (G-C5, High):** if Dispatchr's view must be reliable, add durable delivery — an outbox table drained by a cron, or move the notify onto a Trigger.dev task with retries. This is an ADR-worthy change that would update C5's failure/retry section. See [handoff](../handoff.md) step 1.

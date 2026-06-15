# L8 — Stuck-Build Recovery Loop

**Goal:** Detect builds that SiteLaunchr never moved to a terminal state and get them unstuck.

**Executor:**
- Detection: `cron/reconcile-sl-builds` (Vercel Cron) queries `build_jobs` where `sl_phase IN (queued, running)` and `created_at < now() - threshold` (~120 min); the admin `stuck-builds` route exposes the same query on demand.
- Recovery: `admin/build/resubmit` creates a fresh `build_jobs` row and re-dispatches; the next SL callback drives it forward.

**Evaluator (L2):** age + phase predicate identifies stuck items deterministically. After resubmit, success is the next forward callback (→ L3 / C4).

**Retry:** resubmit is the retry; it creates a new build attempt. SL is idempotent on `external_id`.

**Escalation / gate:** per stuck build, a Dispatchr `build.stuck` event + Telegram alert fire; an admin decides to resubmit or abandon. The resubmit is an explicit human gate.

**Approval gate:** resubmission is a manual admin action (not automatic).

**Observability:** `build_jobs` (phase, timestamps), Dispatchr `build.stuck`, the admin stuck-builds view (business name + minutes stuck).

**Runtime states:** stuck item is `running` past its deadline → flagged → (resubmit) new item pending → running.

**Gaps:**
- Detection is a **detective cron + on-demand query**, not a proactive guarantee; relies on the cron firing and on alerting being configured.
- Resubmit retry-index uses per-token row count; deleting a stuck row before resubmit skews the index (no unique `(token, retryIndex)` constraint).
- If DB insert succeeds but dispatch fails, WR state can diverge from SL (build running on SL, no live WR row). See [gap matrix](../gap-matrix.md).

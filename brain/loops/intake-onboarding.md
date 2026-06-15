# L1 — Intake / Onboarding Loop

**Goal:** A prospective client's questionnaire (or a sales-rep submission) becomes a dispatched website build (or a held Template prospect), with no submission lost.

**Executor:** `app/api/form/start` → `form/[token]` (PUT autosave) → `form/[token]/submit`. On submit, `resolve-form-type` + `shouldRouteToSiteLaunchr()` decide: route to SiteLaunchr build (C1) **or** into the Template/sales flow (`intakeSalesProspect`).

**Evaluator (L2):** submission completeness (required questionnaire fields) + the downstream SL accept gate (C1 response must carry `build_id`+`status`). For the sales arm, the prospect is held until an operator confirms a template exists for its industry.

**Retry:** SL dispatch is idempotent on `external_id`; a resubmit is safe. Autosave (`save-email`, PUT) protects against partial loss before submit. `submitted_at` guards against double-submit (race is a known low gap).

**Escalation / gate:** a failed SL dispatch surfaces in the stuck-builds view (→ L8). The sales arm is an explicit operator gate: prospect waits in `awaiting_template` until released. No automated escalation on `intakeSalesProspect` failure (it is fire-and-forget — gap noted in discovery).

**Approval gate:** sales-rep submissions are intentionally **held** for operator template-availability approval before they can be pushed.

**Observability:** `form_sessions` (step, submitted_at), `build_jobs`, Dispatchr `submission.new` / `build.dispatched` events.

**Runtime states:** form session pending → submitted; build item → see [L3](./build-dispatch.md); sales prospect → held.

**Related:** [C1](../contracts/c1-sitelaunchr-builds-wr.md), [C5](../contracts/c5-dispatchr-lifecycle.md), [build-dispatch](./build-dispatch.md), [stuck-build recovery](./stuck-build-recovery.md).

**Gaps:** `intakeSalesProspect` silent-failure (no alert); submit idempotency race; no PII deletion flow for uploaded files. See [gap matrix](../gap-matrix.md).

# Feature — Client Onboarding & Build

> The inbound path: a client (or rep on their behalf) completes a questionnaire and WR turns it into a managed, billed website build.

## Flow
1. **Questionnaire** (`form/start` → `form/[token]`): multi-step, autosaved (`form_data`/`file_urls` JSONB), form type resolved by `resolve-form-type` (quick | standard | in-depth).
2. **Submit** (`form/[token]/submit`): `shouldRouteToSiteLaunchr()` decides build-now vs. Template/sales hold.
3. **Dispatch** ([C1](../contracts/c1-sitelaunchr-builds-wr.md)): `dispatchBuild` signs + POSTs to SL (source `wr`) with the `kura{}` block (owner known at intake) → `build_jobs(queued)` + Dispatchr `build.dispatched`.
4. **Status** ([C4](../contracts/c4-sitelaunchr-callbacks.md)): SL callbacks drive `build_jobs.sl_phase`; `succeeded`→`live` flips the tracking task to `review`.
5. **Review & complete**: admin approves (admin panel or Telegram) → task `complete` → client email ([L7](../loops/notification.md)).
6. **Bill** ([L5](../loops/billing-invoicing.md)): `phase=live` cost → `build_jobs.cost_usd` → invoice with markup.

## Recovery
Stuck builds (no terminal phase within the threshold) are caught by `cron/reconcile-sl-builds` + the admin stuck-builds view, alerted via Telegram + Dispatchr `build.stuck`, and resubmitted manually ([L8](../loops/stuck-build-recovery.md)).

## Tasks
A build is tracked as a `tasks` row (status machine backlog→in_progress→review→complete, plus `blocked`). Clients see their own tasks via the PIN portal; sales reps see assigned ones and mark outcomes.

## Roles
client (PIN portal) · admin (full task/build control) · sales-rep (submit on behalf, outcomes) · SiteLaunchr (callbacks).

## Gaps
no transaction boundary across client+task+build inserts; submit idempotency race; stuck detection is detective not proactive; no PII-deletion flow for uploads. See [gap matrix](../gap-matrix.md).

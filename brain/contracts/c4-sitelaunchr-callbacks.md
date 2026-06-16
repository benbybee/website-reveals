# C4 — SiteLaunchr → WR build status callbacks

- **Owner (authoritative for shape):** SiteLaunchr (emits); WR defines the verification + mapping it will accept
- **Consumers:** WR (reads, maps to state, bills)
- **Direction:** inbound (SL → WR)
- **Partner:** SiteLaunchr
- **Locality:** distributed remote
- **Version / change doctrine:** SL adds fields additively; the `phase=live` cost fields are a documented, not-yet-shipped extension
- **Lifecycle:** active (status mapping); **partial** (cost reporting awaiting SL)

## Endpoint / event
- `POST /api/sl-callback` — callbacks for the `wr` onboarding source → updates `build_jobs`.
- `POST /api/templates/sl-callback` — callbacks for the `wr-template` source → updates `tpl_prospects`.

SL emits one per-build status of: `queued | running | succeeded | failed | canceled` (and phase markers incl. `live`).

## Auth
Inbound HMAC verification, same scheme as outbound, **plus a freshness window**:
- `verifyCallback(timestamp, rawBody, signature, secret)` → rejects if `|now - timestamp| > 300s` (`stale_timestamp`) or signature mismatch (`bad_signature`).
- Constant-time compare (`verifySignature` via `timingSafeEqual`).

## Payload shape
- Status callbacks carry `build_id`, `external_id`, `phase`/`status`, `site_url`, etc.
- **Cost extension (documented, awaiting SL — [sl-callback-cost-contract.md](../../docs/integrations/sl-callback-cost-contract.md)):** on `phase=live`, SL may include `cost_usd` (preferred, stored verbatim) **or** `usage{model,input_tokens,output_tokens,cache_*}` (WR prices via `lib/anthropic-pricing.ts`). If both, `cost_usd` wins.

## Conformance checks
- `verifyCallback` (HMAC + ±300s freshness) before any state change.
- Status→stage classifier [`lib/templates/sl/callbackStatus.ts`](../../lib/templates/sl/callbackStatus.ts) `slStatusToStage`:
  - `queued|running` → `building`; `succeeded` → `live`; `failed|canceled` → `build_failed`; anything else → `null` (ack-and-ignore, never corrupt state — [Runtime Loop Standard](../standards/runtime-loop-standard.md) rule 2).

## Failure / retry / escalation
- A stale/bad-signature callback is rejected (not applied).
- An unrecognized status is acked and ignored rather than applied.
- Callbacks are the **best-effort fast path**; SL owns delivery and WR is idempotent on `(build_id, status)` mapping. But delivery is **not** guaranteed — a dropped *terminal* callback strands the lead (proven 2026-06-16). The durable backstop is a WR reconcile cron + an SL read path for terminal build state — see [ADR 0006](../decisions/0006-template-callback-reconciliation.md) (supersedes "retry is solely SL's responsibility" for the `wr-template` flow). Until shipped, recovery is manual ([gap matrix](../gap-matrix.md) G-C4-2).

## Source files
- `app/api/sl-callback/route.ts`, `app/api/templates/sl-callback/route.ts`
- [`lib/sitelaunchr.ts`](../../lib/sitelaunchr.ts) `verifyCallback`
- [`lib/templates/sl/callbackStatus.ts`](../../lib/templates/sl/callbackStatus.ts)
- [`docs/integrations/sl-callback-cost-contract.md`](../../docs/integrations/sl-callback-cost-contract.md)

## Change protocol
ADR → `/cross-repo-review` → coordinated deploy. The cost-reporting extension is a no-op on WR until SL ships the fields (WR falls back to the duration-based `estimateBuildCost`).

## Known gaps
- Real cost attribution is blocked on SL emitting `cost_usd`/`usage`; until then `build_jobs.cost_usd` is a clamped duration estimate (flat ~$8.80 on long builds). ([gap matrix](../gap-matrix.md) G-C4)
- No reconciliation for the `wr-template` flow: a dropped terminal callback leaves `tpl_prospects` stuck in `building` forever, and WR can't pull `site_url` from SL. ([gap matrix](../gap-matrix.md) G-C4-2 · fix: [ADR 0006](../decisions/0006-template-callback-reconciliation.md))

# C3 — SiteLaunchr `/api/conversions` (Stage-2 / Kura handoff)

- **Owner (authoritative for shape):** SiteLaunchr (`.strict()` schema, locked — "PIPELINE-COORDINATION.md §7 [SL] 2026-06-03")
- **Consumers:** SiteLaunchr (reads, then dispatches Kura promote); WR (produces)
- **Direction:** outbound (WR → SL → Kura)
- **Partner:** SiteLaunchr (mediator) → Kura (ultimate target)
- **Locality:** distributed remote
- **Version / change doctrine:** field names LOCKED by SL `.strict()`; additive only with coordination
- **Lifecycle:** active

## Endpoint / event
`POST $SL_TEMPLATE_CONVERSION_URL` (defaults to deriving `/api/conversions` from the build URL). Fires when a sales rep marks a prospect **converted**. SL resolves the build by `(source_id, external_id)` and dispatches the **Kura promote** — WR never calls Kura directly.

## Auth
Same HMAC envelope as C2, source `wr-template` (same creds): `x-source-id: wr-template`, `x-api-key`, `x-timestamp`, `x-signature`.
- Env: `SL_TEMPLATE_CONVERSION_URL` (or derived), `SL_TEMPLATE_API_KEY`, `SL_TEMPLATE_HMAC_SECRET`

## Payload shape
From [`lib/templates/sl/convert.ts`](../../lib/templates/sl/convert.ts) (`ConversionPayload`):
```jsonc
{
  "external_id": "<prospect source_id>",   // SAME dedup key as Stage-1 intake
  "kura_input": {
    "slug": "<valid-slug>",                // required, validated by isValidSlug
    "owner_email": "...",                   // required
    "owner_name": "...",                    // optional
    "industry": "..."                       // optional
  },
  "domain": { "name": "..." },              // optional
  "contact": { "ghl_webhook_url": "..." }   // optional; SL re-validates allowlist
}
```
WR sends **no `build_id` and no `kura_project_id`** — SL resolves them.

## Conformance checks
- Validator `validateConversionInput` (requires `external_id`, `owner_email`, valid `slug`).
- Response classifier `classifyConversionResponse` → `ConversionOutcome` ([Pattern P10](../standards/pattern-library.md)):
  - `202` / `200 status:converting` → **converting** (ok)
  - `200 already_converting:true` → **already_converting** (ok, idempotent)
  - `409 build_not_ready` → retryable (preview not yet `succeeded`)
  - `404` → build_not_found (terminal, not retryable)
  - `429` / `5xx` → retryable error; other `4xx` → terminal
- Gate before send: the convert route only fires for prospects in stage `live` or `converted` (`CONVERTIBLE_STAGES`) — an evaluator gate ([Evaluator Standard](../standards/evaluator-standard.md) L2).

## Failure / retry / escalation
- Idempotent on `external_id`; network failure → `httpStatus:0 retryable:true`.
- **Retryable outcomes are surfaced to the rep/UI for manual re-fire — there is no automatic retry loop.** (gap)
- Escalation: a `build_not_found` (404) is terminal and needs operator attention.

## Source files
- [`lib/templates/sl/convert.ts`](../../lib/templates/sl/convert.ts)
- `app/api/templates/prospects/[id]/convert/route.ts` — caller (admin-gated, captures owner data)

## Change protocol
ADR → `/cross-repo-review` → coordinated deploy. This seam is the Kura handoff; `kura_input.slug` / `owner_email` are consumed by Kura provisioning downstream of SL.

## Known gaps
- Retryable conversion outcomes have no automated retry loop — relies on a human re-firing. ([gap matrix](../gap-matrix.md) G-C3)
- No payment/Stripe gate in v1 (operator decision); conversion is a rep action only. (G-C3b)

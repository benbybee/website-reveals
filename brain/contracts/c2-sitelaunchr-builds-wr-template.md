# C2 — SiteLaunchr `/api/builds` (`wr-template` GTM source)

- **Owner (authoritative for shape):** SiteLaunchr (`.strict()` schema in SL repo; template selection logic in sitelaunchr-builder `select.mjs`)
- **Consumers:** SiteLaunchr (reads); WR (produces)
- **Direction:** outbound (WR → SL)
- **Partner:** SiteLaunchr
- **Locality:** distributed remote
- **Version / change doctrine:** additive-only on `brief`; `brief.industry` MUST be SL's controlled-vocabulary slug (template selection key)
- **Lifecycle:** active

## Endpoint / event
`POST $SL_TEMPLATE_BUILD_URL` (defaults to `$SITELAUNCHR_API_URL`). This is the **outbound GTM / Template Site** path: WR pushes a campaign's `qualified` prospects as speculative preview builds. One POST per build (no batch endpoint).

## Auth
HMAC envelope, source `wr-template` — **separate credentials** from `wr` (its own sources row at SL):
- `x-source-id: wr-template`
- `x-api-key: $SL_TEMPLATE_API_KEY`
- `x-timestamp`, `x-signature` (same scheme as C1)
- Env: `SL_TEMPLATE_BUILD_URL`, `SL_TEMPLATE_API_KEY`, `SL_TEMPLATE_HMAC_SECRET`, `SL_TEMPLATE_TRANSPORT`

## Payload shape
From [`lib/templates/sl/toBuildPayload.ts`](../../lib/templates/sl/toBuildPayload.ts) (`BuildPayload`):
```jsonc
{
  "external_id": "<prospect source_id>",   // dedup key
  "form_type": "quick",
  "brief": {
    "business_name": "...",
    "industry": "<sl_slug>",               // EXACT-match template selector
    "what_you_do": "...",                  // optional → business.description
    "all_services": "svc, svc",            // optional
    "address": "street, city, ST zip",     // optional
    "contact_phone": "...", "contact_email": "...",  // optional
    "logo_url": "...", "brand_colors": ["#.."]       // brand DNA, optional
  }
}
```
- **No `kura{}` block at intake** — owner/kura data is a Stage-2 input ([C3](./c3-sitelaunchr-conversions.md)).
- **Photos are NOT shipped** — operator bakes imagery into templates; only business info + logo + colors are injected.

## Conformance checks
- Single mapper `toBuildPayload`; single validator `validateBuildPayload` (requires `external_id`, `form_type`, `brief.business_name`, `brief.industry`).
- Dry-run preview path persists to `tpl_sl_batches` (`status: dry_run`) without sending ([Pattern P6](../standards/pattern-library.md)).
- Two transports: `post` (HMAC POST per build) and `table` (write payload set to `tpl_sl_batches` for SL to read — dry-run-safe default until creds provisioned).
- 429 honored via `retry-after` up to `maxRetries=3`; per-build failures isolated, not thrown.

## Failure / retry / escalation
- Per-build `BuildResult{ok,status,build_id,duplicate,error}` — one bad prospect never aborts the batch.
- 429 retried up to 3×; other non-2xx returned as `ok:false` and surfaced in the push result.
- Idempotent on `external_id`.
- Escalation: none automated — a failed build sits for operator review (gap).

## Source files
- [`lib/templates/sl/toBuildPayload.ts`](../../lib/templates/sl/toBuildPayload.ts), [`adapter.ts`](../../lib/templates/sl/adapter.ts), [`push.ts`](../../lib/templates/sl/push.ts)
- `app/api/templates/campaigns/[id]/push/route.ts` — caller

## Change protocol
ADR → `/cross-repo-review` → coordinated deploy. The `industry` slug vocabulary is shared with sitelaunchr-builder's template manifests; adding an industry requires a template on the SL side first.

## Known gaps
- No automated SL-side conformance probe; conformance is the local validator + SL's `.strict()` reject. ([gap matrix](../gap-matrix.md) G-C2)
- Failed builds have no escalation/dead-letter. (G-C2b)

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

## Supported industries (template vocabulary — SL/sitelaunchr-builder owned)
`brief.industry` selects a full-site template; the worker normalizes space↔hyphen and case. Snapshot confirmed by SL 2026-06-16 (7 templates) — **SL-owned, may drift; re-confirm before relying on it as a hard gate.** A build for an industry outside this union fails at template selection.

| Template | Accepted industries |
|---|---|
| `concrete-bold` | concrete, concrete contractor, construction, masonry, paving, foundations, general contractor |
| `electric-editorial-bolt` | electrical, electrician |
| `house-cleaning-fresh` | house cleaning, maid service, residential cleaning, janitorial |
| `hvac-precision-comfort` | hvac, air-conditioning, heating-cooling |
| `landscaping-leaf-teal` | landscaping, lawn care, lawn maintenance, hardscaping, irrigation, tree service |
| `pest-control-bold` | pest-control, exterminator, home-services |
| `pool-service-violet-glow` | pool service, pool cleaning, pool maintenance, spa service |

Adding an industry = add a template dir under sitelaunchr-builder `templates/<slug>/` with an `industries[]` array (syncs to SL's `site_templates`); no SL code change. A WR pre-dispatch gate against this union would catch truly-unsupported industries (not in any template) but **would not** catch a supported-industry build that fails downstream (see worker gap below).

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
- **Worker fill-schema size limit (sitelaunchr-builder):** rich multi-page templates can exceed Gemini's constrained-decoding state limit at the LLM slot-fill step → `AI_APICallError 400 … too many states`, non-retryable. Observed 2026-06-16 on `hvac-precision-comfort` (build `25e6ab97`, REIC Rentals). Worker-side bug; SL is fixing with the Builder. The industry IS supported — this is a downstream render failure, not a vocabulary miss. (G-C2c)
- **Failure diagnostics:** SL now synthesizes a human-readable `error_message` when the worker posts `failed` with a null reason (SL PR #7, 2026-06-16) — flows to the callback + `GET /api/builds/:id`. Pre-fix failures (e.g. REIC) keep their null `error_message`.

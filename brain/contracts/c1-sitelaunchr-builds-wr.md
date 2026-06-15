# C1 — SiteLaunchr `/api/builds` (`wr` onboarding source)

- **Owner (authoritative for shape):** SiteLaunchr (`.strict()` schema lives in SL repo)
- **Consumers:** SiteLaunchr (reads); WR (produces)
- **Direction:** outbound (WR → SL)
- **Partner:** SiteLaunchr
- **Locality:** distributed remote
- **Version / change doctrine:** additive-only on the `brief`; the `kura{}` block and `external_id` are load-bearing and may not be renamed without coordinated deploy
- **Lifecycle:** active

## Endpoint / event
`POST $SITELAUNCHR_API_URL` (SL's `/api/builds`). This is the **client onboarding** path: a real client completes the questionnaire on websitereveals.com and WR dispatches one build.

## Auth
HMAC envelope, source `wr`:
- `x-source-id: wr`
- `x-api-key: $SITELAUNCHR_API_KEY`
- `x-timestamp: <unix seconds>`
- `x-signature: HMAC_SHA256($SITELAUNCHR_HMAC_SECRET, "${timestamp}.${rawBody}")`
- Env: `SITELAUNCHR_API_URL`, `SITELAUNCHR_API_KEY`, `SITELAUNCHR_HMAC_SECRET`

## Payload shape
From [`lib/sitelaunchr.ts`](../../lib/sitelaunchr.ts) `dispatchBuild` (`DispatchPayload`):
```jsonc
{
  "external_id": "<stable dedup key>",
  "form_type": "quick | standard | in-depth",
  "brief": { /* questionnaire answers, mapped by lib/sitelaunchr-mapper.ts */ },
  "kura": { "owner_email": "...", "owner_name": "...", "industry": "...", "slug": "..." },
  "callback_url": "<WR /api/sl-callback>",
  "options": { "priority": "normal | high" }
}
```
Note: unlike the Template path (C2), the onboarding path supplies the `kura{}` block **at intake** because the owner is already known.

## Conformance checks
- Single mapper: [`lib/sitelaunchr-mapper.ts`](../../lib/sitelaunchr-mapper.ts).
- Sign-once/send-exact: body serialized once, signed, sent verbatim ([Pattern P2](../standards/pattern-library.md)).
- Response gate: accepts `200|202` with `build_id` + `status` present; throws `SiteLaunchrError` otherwise.
- On a fresh (non-`duplicate`) dispatch, fires Dispatchr `build.dispatched` (see [C5](./c5-dispatchr-lifecycle.md)).

## Failure / retry / escalation
- Non-2xx → `SiteLaunchrError(status, code, detail)` thrown to the caller (the submit route / build pipeline), which records the failure. No automatic retry in `dispatchBuild` itself.
- Idempotent on `external_id` — SL returns `duplicate: true` for a repeat; safe to re-fire ([Pattern P3](../standards/pattern-library.md)).

## Source files
- [`lib/sitelaunchr.ts`](../../lib/sitelaunchr.ts) — signer, `dispatchBuild`
- [`lib/sitelaunchr-mapper.ts`](../../lib/sitelaunchr-mapper.ts) — brief mapper
- `app/api/form/[token]/submit/route.ts` — caller (intake)

## Change protocol
ADR → `/cross-repo-review` → coordinated deploy. The `kura{}` block is consumed by SL to promote into Kura; renaming its keys breaks the Kura handoff.

## Known gaps
- No schema-level dry-run against SL before a real onboarding dispatch (relies on SL's `.strict()` to reject). See [gap matrix](../gap-matrix.md) G-C1.

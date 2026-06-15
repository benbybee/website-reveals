# C5 — WR → Dispatchr lifecycle events

- **Owner (authoritative for shape):** Website Reveals (WR defines the event vocabulary)
- **Consumers:** Dispatchr (Ben's Mission Control — observes WR's pipeline)
- **Direction:** outbound (WR → Dispatchr)
- **Partner:** Dispatchr (joindispatchr.com)
- **Locality:** distributed remote
- **Version / change doctrine:** additive — new event types or fields are safe; renaming/removing an existing event requires coordination since Dispatchr keys on `type`
- **Lifecycle:** active

## Endpoint / event
`POST $WEBSITEREVEALS_DISPATCHR_WEBHOOK_URL`, one POST per event. Event `type` is one of:
- `submission.new` — a new questionnaire submission.
- `build.dispatched` — a build was sent to SiteLaunchr (fired on fresh, non-duplicate dispatch).
- `build.live` — build succeeded (carries `siteUrl`, `kuraPortalUrl`).
- `build.failed` — build failed (carries `errorMessage`).
- `build.stuck` — watchdog found a stalled build (carries `buildId`, `ageHours`).
- `submission.abandoned` — an idle submission (carries `currentStep`, `ageHours`).

(Exact `WrEvent` union in [`lib/dispatchr-webhook.ts`](../../lib/dispatchr-webhook.ts).)

## Auth
- Header `x-wr-webhook-secret: $WEBSITEREVEALS_DISPATCHR_WEBHOOK_SECRET`.
- Env: `WEBSITEREVEALS_DISPATCHR_WEBHOOK_URL`, `WEBSITEREVEALS_DISPATCHR_WEBHOOK_SECRET`. Missing either → silent no-op.
- No HMAC signature (shared-secret header only). Lower assurance than the SL seams (C1–C4), acceptable for an observability feed.

## Payload shape
Per event, e.g.:
```jsonc
{ "type": "build.live", "token": "<form/external id>", "businessName": "...", "siteUrl": "...", "kuraPortalUrl": "..." }
```
`briefPreview` on `submission.new` is the first 240 chars of the form data with internal `_`-prefixed keys removed (`buildBriefPreview`).

## Conformance checks
- Single producer: `notifyDispatchr` ([`lib/dispatchr-webhook.ts`](../../lib/dispatchr-webhook.ts)); callers never hand-assemble events.
- TypeScript `WrEvent` discriminated union is the shape contract on WR's side.

## Failure / retry / escalation
- **Fire-and-forget** ([Pattern P4](../standards/pattern-library.md)): 3s `AbortController` timeout; any non-2xx or error is `console.warn`-ed and **swallowed** — never thrown into the caller.
- **No retry, no durable delivery, no dead-letter, no escalation.** A down Dispatchr means lost events.
- This is acceptable for an *observability* feed but is the single biggest contract gap (G-C5 / [L4](../loops/dispatchr-lifecycle.md)).

## Source files
- [`lib/dispatchr-webhook.ts`](../../lib/dispatchr-webhook.ts) — `notifyDispatchr`, `WrEvent`, `buildBriefPreview`
- Callers: `lib/sitelaunchr.ts` (`build.dispatched`), build/cron routes (`build.live|failed|stuck`, `submission.new|abandoned`)

## Change protocol
ADR → `/cross-repo-review` → coordinated deploy. Adding an event type is additive; Dispatchr must be told before WR emits a new `type` it should act on.

## Known gaps
- **G-C5 (High):** no delivery guarantee — events can be silently lost. Remedy options (outbox + drain cron, or move onto a retrying task) in [handoff](../handoff.md) step 1.
- Shared-secret header only (no signature/freshness window like C4).

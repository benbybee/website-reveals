# SL build-status read path (for WR reconciliation)

**Audience:** the SiteLaunchr (SL) service that owns `/api/builds` and emits build callbacks. **Not** SL Builder — the build itself succeeds fine; this is purely about the API/callback layer being able to recover a dropped callback.

**Status:** requested by WR. Tracked as [ADR 0006](../../brain/decisions/0006-template-callback-reconciliation.md) and gap G-C4-2. Additive — no breaking changes to the existing `/api/builds` POST or the callback.

---

## 1. Why this exists (the incident)

On 2026-06-16, WR ran a real end-to-end test of the `wr-template` pipeline:

1. WR dispatched a build → SL accepted: `202 { build_id, status:"queued" }`.
2. SL's early `queued/running` callback **landed** at WR — the prospect moved to `building` and stored `sl_build_id`. So the callback channel + HMAC verification are working.
3. SL **built the site successfully** (confirmed below).
4. **SL's `succeeded` callback never reached/updated WR.** 30+ minutes later WR's record was still `building`, with no `site_url`.

Impact: the finished site is **invisible to WR's public "claim your free site" funnel** (`/join`), which only surfaces leads that have a `preview_url`. A successfully built — and billable — site silently dropped out of the funnel, and WR had **no way to recover it**, because:

- WR can only learn a build's `site_url` from the **callback**. There is no read-back.
- A re-POST to `/api/builds` (idempotent on `external_id`) returns `{ "status": "succeeded", "duplicate": true }` — it confirms SL finished, but **does not include `site_url`**.

The live build still stuck as of writing:
- `external_id`: `wr-tpl-ChIJQ-2wFmuBS4cReF0ZCRJm1Cg`
- `build_id`: `3c78c4bc-f422-4f61-92b2-d5a98ae88314`

---

## 2. The existing seam (so nothing here is assumed)

**Source identity.** The template pipeline dispatches as source **`wr-template`** (distinct from the `wr` onboarding source). It has its own api key + HMAC secret, provisioned on SL's `/admin/sources`.

**Auth scheme (shared by every call on this seam, both directions).** HMAC-SHA256, hex:

```
signature = HMAC_SHA256( secret, `${x-timestamp}.${rawBody}` )      // rawBody = the exact bytes sent
```
Headers on a signed request:
```
x-source-id: wr-template
x-api-key:   <the wr-template source api key>
x-timestamp: <unix seconds>
x-signature: <hex HMAC of `${x-timestamp}.${rawBody}`>
```
Freshness: receivers reject if `|now - x-timestamp| > 300s`. Sign the **exact bytes** you send (serialize once; don't re-serialize).

**Outbound build (WR → SL), already live.** `POST {SITELAUNCHR_API_URL}` (currently `https://www.joinsitelaunchr.com/api/builds`):
```jsonc
// headers: x-source-id: wr-template, x-api-key, x-timestamp, x-signature
{
  "external_id": "wr-tpl-<google_place_id>",   // dedup key, stable per business
  "form_type": "quick",
  "brief": {
    "business_name": "Zap Pest Control",
    "industry": "pest control",                // SL maps this to a template
    "all_services": "Pest control service",
    "address": "189 N 100 W St, Gunnison, UT 84634",
    "contact_phone": "+18014231735"
    // optional: what_you_do, contact_email, logo_url, brand_colors[]
  }
}
```
SL responds `202` (new) or `200` (dedup) with `{ build_id, status, duplicate? }`.

**Inbound callback (SL → WR), already live.** SL POSTs to `https://www.websitereveals.com/api/templates/sl-callback`, signed with the **`wr-template` HMAC secret** (`x-timestamp` + `x-signature` over `${ts}.${rawBody}`; WR enforces the ±300s window). Flat per-build body:
```jsonc
{
  "build_id": "3c78c4bc-...",
  "external_id": "wr-tpl-...",     // WR keys on this (== its prospect source_id)
  "status": "succeeded",            // queued | running | succeeded | failed | canceled
  "site_url": "https://<sub>.pages.dev",
  "error_message": null             // on failure
}
```
WR maps `queued|running → building`, `succeeded → live` (stores `site_url` as the preview), `failed|canceled → build_failed` (stores `error_message`). WR is idempotent on `(build_id, status)`.

---

## 3. What we're asking SL to do

### 3a. Immediate — unstick the live test
Resend the `succeeded` callback for `build_id 3c78c4bc-f422-4f61-92b2-d5a98ae88314` (`external_id wr-tpl-ChIJQ-2wFmuBS4cReF0ZCRJm1Cg`), **or** reply with that build's `site_url` and WR will apply it manually.

### 3b. Investigate — why did the terminal callback drop?
The `queued/running` callback to `https://www.websitereveals.com/api/templates/sl-callback` succeeded, so WR's endpoint is up and verifying signatures. We need to know whether the `succeeded` callback was: never sent, sent-and-errored (what response?), or retried-then-given-up. If there are delivery logs per `build_id`, that's the fastest root cause.

### 3c. Durable fix — a read path for terminal build state
Expose a way for WR to **pull** a build's status + URL, so a dropped callback can be reconciled. **Preferred shape:**

```
GET {SITELAUNCHR_BASE}/api/builds/:build_id
  (and/or)  GET {SITELAUNCHR_BASE}/api/builds?external_id=<id>
```
Auth: same `wr-template` source identity already used for dispatch —
```
x-source-id: wr-template
x-api-key:   <wr-template api key>
x-timestamp: <unix seconds>
x-signature: <hex HMAC of `${x-timestamp}.${request_path_with_query}`>   // GET has no body; sign the path+query (or empty string) — your choice, just tell us which
```
(If you'd rather not sign a GET, requiring `x-source-id` + `x-api-key` alone is acceptable for a read.)

**Response** (`200`):
```jsonc
{
  "build_id": "3c78c4bc-...",
  "external_id": "wr-tpl-...",
  "status": "succeeded",                 // same enum as the callback
  "site_url": "https://<sub>.pages.dev", // present when status=succeeded; null otherwise
  "error_message": null                  // present when status=failed|canceled
}
```
- `404` if no build for that key. `401` on bad/expired auth (same semantics as `/api/builds`).
- Must reflect the **current terminal state** — i.e. when SL considers the build `succeeded`, this returns `site_url`. (Today the dedup re-POST already knows `status:"succeeded"`; we just also need `site_url`.)

**Acceptable alternative if a GET endpoint is heavy:** include `site_url` (and `error_message`) in the existing `/api/builds` **dedup response** whenever `status` is terminal. WR already calls that path and can read it. A dedicated GET is preferred only because it's an explicit read seam and doesn't overload the dispatch write.

---

## 4. How WR will use it

WR will add a reconcile cron (mirrors the existing `wr`-flow `reconcile-sl-builds`): every ~30 min it finds template prospects stuck in `building` past ~25 min (≥ SL's 18-min target + margin), calls the read path **by `build_id`** (WR stored `sl_build_id` from the early callback), and applies the result exactly as the callback would have. So the expected call pattern is: **low-volume, polled, keyed by `build_id`, only for builds whose callback didn't arrive.** Callbacks remain the primary low-latency path; this is strictly a backstop.

---

## 5. Confirming it landed

1. SL deploys the read path (and resends/repairs the stuck build).
2. WR calls `GET /api/builds/3c78c4bc-...` → expects `{ status:"succeeded", site_url:"https://...pages.dev" }`.
3. WR's reconcile cron flips that prospect to `live`, and it becomes searchable + ZIP-confirmable at `https://www.websitereveals.com/join`.

No changes are required to the existing callback or `/api/builds` POST — this is purely additive. Once SL confirms the endpoint shape (GET vs dedup-response), WR builds the cron against it and moves ADR 0006 to `accepted`.

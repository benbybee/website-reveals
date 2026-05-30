# Template Site Pipeline — Design

**Date:** 2026-05-30
**Status:** Approved (design), pending implementation plan
**Author:** Ben Bybee + Claude

---

## 1. Purpose

A new, self-contained **"Template Site" tool** inside Website Reveals (WR) that:

1. **Scrapes** businesses by industry + location via Apify (default target: businesses with **no website**), with an **on-request deep audit** to also find businesses whose existing website is old/outdated.
2. **Enriches** each business (logo, brand colors, photos, hours, services, socials) into a normalized record.
3. Presents a **lightweight CRM + full sales funnel** so agents can work prospects (call tracking, stage, notes).
4. **Pushes campaign batches** of qualified records to **SiteLaunchr (SL)**, which speculatively builds + pre-deploys a website per business.

This is **net-new and fully isolated** from WR's existing form → `build_jobs` → SL flow. Nothing in the current pipeline changes.

### Why data quality is the whole game
SL's fill step is deterministic-first: it reads our fields straight from the DB with no AI wherever data is complete. Every empty/wrong field either forces a fallback or shows as a gap on a live site a real owner is looking at. **The number of records that clear the "complete + high-confidence" bar is, directly, how many businesses get a clean site at ~zero AI cost.** Completeness, correctness, and normalization beat volume.

---

## 2. Module boundary (the kill-switch)

Everything lives under one namespace so it can be deleted wholesale without side effects:

- **Routes:** `app/admin/templates/*` (UI) + `app/api/templates/*` (endpoints).
- **DB:** all tables prefixed `tpl_` — own taxonomy, own cost ledger, own records. No foreign keys into existing tables except a **soft** `agent_id` referencing `sales_reps` (no hard FK, so the module stays detachable; agents are the same people / one login).
- **Code:** `lib/templates/*` (Apify clients, enrichment, scoring, SL batch adapter). The existing `lib/sitelaunchr*.ts` form path is untouched.
- **Feature flag:** `TEMPLATES_ENABLED` hides the nav entry and short-circuits the API. Off = gone.

---

## 3. Data model

| Table | Purpose |
|---|---|
| `tpl_industries` | Own taxonomy (independent of WR's `industries` table): `slug`, `display_name`, `google_categories[]` (Maps category strings to pull), `sl_slug` (the controlled-vocabulary `industry_slug` SL's template library matches on — e.g. `home-services`, `legal`, `restaurant`). |
| `tpl_campaigns` | One scrape request: industry, `locations[]`, `target_count`, `audit_enabled`, status, counts (scraped/qualified/incomplete/pushed), cost rollup. |
| `tpl_prospects` | One row per real business = canonical record. Stores SL's exact normalized JSON in a `record` JSONB column **plus** promoted columns for filtering: `business_name`, `city`, `state`, `phone`, `website_status` (`none`/`stale`/`has_site`), `confidence`, `completeness`, `stage`, `agent_id`. `source_id` = stable dedupe key. |
| `tpl_prospect_assets` | Logo/photo rows: `src_url`, `slot`, `width`, `height`, `fetch_verified` flag. Keeps asset verification auditable. |
| `tpl_cost_events` | Append-only ledger: every Apify run (`actor`, `units`, `usd`, `campaign_id`, `created_at`). Powers cost-per-qualified-record. |
| `tpl_sales_activity` | Call logs / stage transitions / notes per prospect, with `agent_id` + timestamp. Drives the sales view. |
| `tpl_sl_batches` | Each push: `campaign_id`, `batch_id`, chunk count, transport used, SL response/status, callback state. |

### Dedupe / `source_id`
Anchored on Google **`place_id`** (stable across re-scrapes): `source_id = "wr-tpl-{place_id}"`. Re-running a campaign **upserts** on `source_id` so updates overwrite rather than duplicate — matches SL's overwrite-not-duplicate requirement and keeps the CRM clean.

---

## 4. Pipeline (Trigger.dev orchestration)

A 3,500-record campaign runs as Trigger.dev v3 jobs so it survives timeouts/retries and reports live progress to the CRM. Each stage writes a `tpl_cost_event` as it consumes Apify units.

### Stage 1 — Discover (base scrape, default)
- Actor: [`compass/crawler-google-places`](https://apify.com/compass/crawler-google-places), one run per (industry × location), querying the campaign's `google_categories`.
- Filter `website` empty → `website_status = 'none'` (default targets).
- Rows with a website kept aside as `website_status = 'has_site'` (audit candidates only).
- Upsert into `tpl_prospects` on `source_id`. Emit cost event.

### Stage 2 — Deep audit (ONLY on explicit request)
- **Never automatic.** Off at campaign setup; runs only when the owner/agent clicks "Run deep audit" (e.g. when short of target — the 500-vs-1,000 case).
- Operates on the `has_site` set: fan URLs through [`accurate_pouch/tech-stack-detector`](https://apify.com/accurate_pouch/tech-stack-detector) + a Lighthouse actor ([`nexgendata/google-lighthouse-checker`](https://apify.com/nexgendata/google-lighthouse-checker)).
- Score staleness (no HTTPS, parked/dead CMS, low mobile/perf score, old copyright). Promote worst offenders to `website_status = 'stale'` into the qualified pool until target is hit. Emit cost event.
- **Cost estimate shown before running:** select N profiles → `~$X` preview (units/record × N × actor rate) so spend is approved with eyes open.

### Stage 3 — Enrich (data-quality core)
- **Facebook/social pass:** find the business's FB page, pull profile image (logo), cover photo, hours, about. Fill `logo`, extra `photos`, gaps in `hours`. (Most no-website local businesses have a FB page — highest-yield source for the exact fields Google Maps can't provide.)
- **Color extraction:** derive all four `brand_colors` tokens (`primary`, `accent`, `neutral_dark`, `neutral_light`) deterministically from the logo (no AI) — the documented hex shape SL's `tokens.css` overlay requires.
- **Services extraction:** capture the business's real `services[]` as `{name, description}` from the scrape (GBP categories/attributes) + Facebook "services" section. SL flagged this as the highest-value field for killing `/services` page hallucination.
- **Normalize on our side** to SL's spec: phone → E.164, state → 2-letter, hours → 24h structured, URLs → absolute + fetchable. SL never cleans data.
- **Asset verification:** HEAD-check every logo/photo URL is live + fetchable; store dimensions; drop dead/auth-walled URLs so SL never gets a broken hero. Mark `fetch_verified` in `tpl_prospect_assets`.

### Stage 4 — Score & gate
- `completeness` = which required fields present. `confidence` = identity-anchor strength (name + address + phone).
- **Gate (build will not run without these):** `source_id`, `business_name`, `industry_slug`, `address`, `phone`, AND ≥1 verified `{logo | photos}`.
- Pass → `qualified`. Short → `incomplete` (routed out of batch, never pushed). Low identity confidence → flagged.

### On-request targeted backfill ("Enrich more")
The aggressive multi-source enrichment is an **on-demand action**, not always-on. From the CRM, filter to incomplete prospects, select them, and run the heavier actors (logo/image search, additional sources) aimed only at the missing fields, then re-score — possibly flipping `incomplete → qualified`. **Cost estimate shown before running.**

---

## 5. CRM & sales surfaces

### A. Campaigns list + setup (`/admin/templates`)
New-campaign form: industry (from `tpl_industries`), locations (multi-state/city/radius), target count, `audit_enabled` toggle. Each card shows live progress + cost rollup (scraped / qualified / incomplete / pushed, $ spent vs cost-per-qualified).

### B. Prospect CRM (`/admin/templates/campaigns/[id]`)
- Table columns: name, city/state, phone, `website_status`, **completeness badge** (green = qualified, **red = needs data** + count of missing fields), `confidence`, `stage`, assigned agent.
- **Filters/sorts:** by completeness ("needs data" first), by missing field, by stage, by agent, by website_status.
- **Bulk actions:** `Enrich more` (targeted backfill w/ cost preview), `Run deep audit` (w/ cost preview), `Assign agent`, `Approve for SL`.
- **Row detail drawer:** full normalized record, asset thumbnails (verified ✓ / dead ✗), provenance `sources[]`, inline editor to hand-fix a field before pushing.

### C. Sales view (`/admin/templates/sales`) — full funnel
- Board/list scoped to the logged-in agent: assigned prospects by `stage` (`new → contacted → interested → converted` / `dead` / `do_not_call`).
- Per prospect: click-to-call phone, **live SL preview URL** once built (agent opens the real site on the call), stage dropdown, call-log/notes → `tpl_sales_activity`. Stage changes + notes timestamped + attributed to `agent_id`.

### D. Batch review & push (`/admin/templates/campaigns/[id]/push`)
Shows `qualified` records only (incomplete excluded by the gate but visible/red in main CRM for backfill). "Push batch to SL" assembles the chunked artifact and dispatches.

---

## 6. SL handoff (batch adapter + callback)

SL **requires batch delivery** ("campaign batches, not one-at-a-time") and left the exact mechanism open ("batch JSON upload vs. DB table SL reads"). At 3,500 prospects, the existing per-record `/api/builds` POST does not scale and is not what SL wants.

- **Canonical record** = SL's exact spec JSON, stored per prospect. Batch builder assembles approved `qualified` records into a campaign artifact, **chunked ~500 records/file**, each tagged `campaign_id` + `batch_id`, so the whole campaign goes to SL as one unit and SL fans out builds.
- **Swappable transport** behind one config switch (`SL_TEMPLATE_TRANSPORT`):
  - `post` → POST each chunk to SL's batch endpoint (HMAC-signed, reusing the signing util from `lib/sitelaunchr.ts`).
  - `table` → write records to a shared store SL reads (Supabase table or Blob URL handed to SL).
  - Default to whichever SL confirms; until then build/validate/dry-run the artifact.
- **Callback:** `app/api/templates/sl-callback` (separate from the existing `/api/sl-callback`) receives per-record build status → updates `tpl_prospects.stage` to `building → live` (+ stores preview URL for agents) or `build_failed`. Fully decoupled from the form-flow callback.
- **Idempotency:** stable `source_id` → re-push updates existing SL sites, never duplicates.

### Canonical record shape (WR-internal, stored in `tpl_prospects.record`)
```json
{
  "source_id": "wr-tpl-{place_id}",
  "scraped_at": "ISO-8601Z",
  "confidence": 0.0,
  "business_name": "", "legal_name": "",
  "industry_raw": "Pest control service",
  "industry_slug": "<tpl_industries.sl_slug>",
  "address": { "street": "", "city": "", "state": "XX", "zip": "", "country": "US" },
  "phone": "+1XXXXXXXXXX", "email": "", "website": "",
  "hours": [ { "day": "mon", "open": "08:00", "close": "17:00" } ],
  "geo": { "lat": 0.0, "lng": 0.0 },
  "services": [ { "name": "", "description": "" } ],
  "logo": { "src_url": "", "width": 0, "height": 0 },
  "brand_colors": { "primary": "#......", "accent": "#......", "neutral_dark": "#......", "neutral_light": "#......" },
  "photos": [ { "slot": "hero", "src_url": "", "alt": "", "credit": null } ],
  "description": "", "socials": { "facebook": "", "instagram": "" },
  "sources": [ "" ]
}
```
**Minimum viable record (gate):** `source_id`, `business_name`, `industry_slug`, `address`, `phone`, and ≥1 of `{logo, photos}`.

### SL delivery shape — map canonical → `prep.brief.*`
SL's Astro Template worker reads a nested `prep` object (source of truth: SL's `scripts/fetch-prep.mjs`, the `/api/internal/builds/{id}/preparation` response). The batch adapter maps each canonical record into that shape:

| Canonical field | → SL `prep` path | Notes |
|---|---|---|
| `industry_raw` | `brief.business.industry` | Free-text, fallback signal. |
| `industry_slug` | `brief.business.industry_slug` | **NEW ask.** Controlled vocab; drives deterministic template `select`. Without it SL defaults every business to one template. |
| `business_name` | `brief.business.name` | Hard-fails SL build if missing. |
| `description` | `brief.business.description` | Headline/meta seed. |
| `services[]` `{name, description}` | `brief.business.services[]` | **NEW ask + highest-value.** Real services from scrape → kills `/services` page hallucination. |
| `address` | `brief.contact.address` | LocalBusiness schema + contact page. |
| `phone` | `brief.contact.phone` | `tel:` CTA + schema. |
| `email` | `brief.contact.email` | Contact page. |
| `hours` | `brief.contact.hours` | Often empty today — see reliability matrix. |
| `brand_colors` `{primary, accent, neutral_dark, neutral_light}` | `brief.brand.colors` | **NEW ask.** Documented 4-key hex shape → deterministic `tokens.css` overlay. Resolution order SL uses: `brief.brand.colors` → `current_site_brand.colors` → `logo_colors` → template default. |
| `logo` `.src_url` | `current_site_brand.logo_url` | **NEW reliability ask.** Often null for scraped businesses; we fill via the Facebook pass. |
| `photos[]` `{slot, src_url, alt}` | `stock_photos[]` | `slot` enum must align to template image slots (`hero`, `about`, `service-1`, …); SL downloads `src_url` → `local_path`. |
| `geo` | (schema/maps) | Optional. |

**Stage 1 (speculative Cloudflare) does NOT need `kura_input`** (`slug`/`owner_email`/`owner_name`). That block is required only at **Stage 2 conversion**, after the owner scans the postcard QR and converts — at which point WR supplies it. So speculative batches omit it cleanly (we have no owner contact yet).

### Reliability matrix — what WR guarantees vs. best-effort
SL keeps model/template fallbacks for best-effort fields; guaranteed fields let SL go fully deterministic.

| Field | WR guarantee | Basis |
|---|---|---|
| `business_name`, `address`, `phone` | **Guaranteed** for any `qualified` record | They're in the completeness gate; nothing pushes without them. |
| `industry_slug` | **Guaranteed** | Campaign is scoped to one known industry → slug is correct by construction. |
| `photos` (≥1) | **Guaranteed** (when no logo) | Gate requires `{logo OR photos}`; GBP almost always has photos. |
| `logo`, `brand_colors` | **Best-effort** | From Facebook pass + color extraction; may be absent → SL falls back. |
| `hours` | **Best-effort** | From GBP/Facebook; can be empty. |
| `services[]` | **Best-effort (target high)** | From scrape/enrichment; backfillable on demand. |
| `email`, `socials`, `description` | **Best-effort** | Opportunistic. |

### What WR does NOT do (per SL)
No marketing copy / taglines / About prose (pre-authored in template). No template selection or design (SL picks from `industry_slug`). No deploy/hosting (SL + Cloudflare). Fonts are template-fixed — never sent. Send facts, not voice.

---

## 7. Cost tracking

Separate ledger from WR's SL build-cost tracking:
- Every Apify run → `tpl_cost_event` (`campaign_id`, `actor`, `units`, `usd`). Read **actual** consumption from Apify run stats, not estimates.
- **Campaign rollup:** total spend, broken out by stage (discover / audit / enrich / backfill), headline **cost-per-qualified-record**.
- **Per-action cost preview** before "Run deep audit" / "Enrich more": `units × rate × N` so spend is approved up front (the "$1 always vs $50 think-twice" guardrail).
- Apify config in env: `APIFY_TOKEN` + per-actor unit-cost constants.

---

## 8. Reliability & error handling

- **Idempotent everywhere:** every stage upserts on `source_id` → no duplicate prospects or SL sites on re-run.
- **Per-stage failure isolation:** each stage is a retriable Trigger.dev task; one actor failing retries that stage only. Partial results persist ("3,200 of 3,500 enriched, 300 errored, retry available").
- **Asset verification mandatory before push:** dead/auth-walled URLs dropped at enrich time. A prospect losing its only asset drops back to `incomplete` (red) rather than pushing a broken site.
- **Apify rate/quota:** concurrency caps + backoff; quota-hit pauses the campaign (not fails) and resumes.
- **SL push failures** per-chunk + retriable; `tpl_sl_batches` tracks which chunks landed so retry only re-sends failures.
- **Secrets:** `APIFY_TOKEN` + SL keys via env only, never committed.

---

## 9. Testing

- **Unit (pure, no network):** normalizers (phone/state/hours/URL), completeness/confidence scorer + gate, color extraction, batch-chunk assembly. Heaviest coverage — correctness-critical.
- **Fixture-based pipeline tests:** saved Apify/Facebook JSON → enrich + score → assert canonical record matches SL spec exactly. No live calls in CI.
- **Adapter contract test:** batch artifact validates against SL's record schema; both transports produce identical record JSON.
- **Manual E2E:** one small real campaign (e.g. pest control, single small city, target ~25) end-to-end through to a **dry-run** SL push, before any large run.

---

## 10. New env vars (names only)

```
TEMPLATES_ENABLED
APIFY_TOKEN
SL_TEMPLATE_TRANSPORT          # "post" | "table"
SL_TEMPLATE_BATCH_URL          # when transport=post (SL to confirm)
# reuses existing SITELAUNCHR_HMAC_SECRET for signing
# per-actor unit-cost constants (config, not secret)
```

---

## 11. Open items dependent on SL

- Final **batch transport** (`post` vs `table`) + endpoint/credentials — SL to confirm. Design is transport-agnostic, so this is a one-config-value swap.
- Official **industry enum** list — reconcile `tpl_industries.sl_enum` against it once received. Until then, each campaign is scoped to one known industry, so `industry` is correct by construction.

# Rep Instant-Preview Pipeline — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: use `executing-plans` (or `subagent-driven-development`) to implement this plan task-by-task. Design source of truth: [2026-08-31-rep-instant-preview-design.md](./2026-08-31-rep-instant-preview-design.md).

**Goal:** Add a sales-rep self-serve pipeline (pick industry → Google Business Profile lookup → cheap deterministic enrich → SL template build → email the rep a speculative preview), and close review gaps 1–5, reusing the existing `tpl_*` machinery.

**Architecture:** New interactive surface on top of the existing scrape→enrich→`toBuildPayload`→push→C4-callback pipeline. Enrichment is **deterministic-first, LLM-minimal**: Google Places API for the picker; homepage HTML parse + revived `brandColorsFromPalette` for logo/colors; Firecrawl branding scrape only on miss. Output is a **speculative preview** (the `push`+C4 path). The one cross-repo change (`brief.photos[]`) ships last, behind a flag, after SL templates accept it.

**Tech Stack:** Next.js App Router, Trigger.dev v3, Supabase (service-role), Google Places API (new), Firecrawl, Resend, vitest.

**Test/verify commands:** `npx tsc --noEmit` · `npx eslint` · `npx vitest run <path>` · migrations via `node scripts/apply-migration.mjs supabase/migrations/NNN.sql`. UI/e2e per the `verifying-changes` skill (detect-then-ask on dev servers — never auto-start).

## Sequencing (why this order)
Land the **deterministic-safe local fixes first** (they need no partner coordination), then the new capability, then the cross-repo change:

- **M0** ADR + config scaffolding (no behavior change)
- **M1** Gap 3 — post-merge logo HEAD-verify (isolated bug)
- **M2** Gap 4 — taxonomy: `sl_template_ready` + canonical `tpl_industries`
- **M3** Gap 5 — dollar cost estimate + per-rep/day cap
- **M4** Gap 1 — template-coverage gate (depends on M2)
- **M5** Google Places interactive GBP search (new)
- **M6** Gap 2 — deterministic-first enricher (revives `brandColorsFromPalette`)
- **M7** Rep surface + single-prospect build + rep email
- **M8** C2 `brief.photos[]` — behind `SL_TEMPLATE_PHOTOS_ENABLED`, ships last

Each of M1–M4 is independently mergeable. M8 must not deploy until the SL templates accept `photos[]` (coordinated per the ADR).

---

## M0 — ADR + config scaffolding

### Task 0.1: Write ADR 0007
**Files:** Create `brain/decisions/0007-rep-instant-preview-and-photos-c2.md`

Record: the new rep instant-preview loop (goal/executor/evaluator/retry/escalation/observability); the decision to reuse `tpl_prospects` in the rep's `kind='sales'` campaign; deterministic-first enrichment; and the **C2 contract change** adding optional `brief.photos[]` — additive, gated by `SL_TEMPLATE_PHOTOS_ENABLED`, WR must not send it until SL Builder templates declare photo slots. Link [C2 contract](../contracts/c2-sitelaunchr-builds-wr-template.md) and note the coordinated-deploy requirement + `/cross-repo-review`.

**Step: Commit** — `git add brain/decisions/0007-rep-instant-preview-and-photos-c2.md && git commit -m "docs(adr): 0007 rep instant-preview + photos[] C2 change"`

### Task 0.2: Google Places + photos config accessors
**Files:** Modify `lib/templates/config.ts`; Modify `.env.example`; Test `lib/templates/config.test.ts`

**Step 1 (test):** assert `googlePlacesEnabled()` is false when `GOOGLE_PLACES_API_KEY` unset, true when set; `slTemplatePhotosEnabled()` defaults false.

**Step 2:** run `npx vitest run lib/templates/config.test.ts` → FAIL.

**Step 3 (impl):** add to `lib/templates/config.ts`:
```ts
export const GOOGLE_PLACES_API_KEY = () => (process.env.GOOGLE_PLACES_API_KEY ?? "").trim();
export const googlePlacesEnabled = () => GOOGLE_PLACES_API_KEY().length > 0;
// C2 photos[] gate — OFF until SL Builder templates declare photo slots (ADR 0007).
export const slTemplatePhotosEnabled = () =>
  (process.env.SL_TEMPLATE_PHOTOS_ENABLED ?? "").trim().toLowerCase() === "true";
// Per-rep daily instant-preview cost ceiling (USD).
export const REP_DAILY_BUDGET_USD = () => Number(process.env.REP_DAILY_BUDGET_USD ?? "5") || 5;
```
Add the three keys to `.env.example` (empty / documented). **Never** commit real values.

**Step 4:** `npx vitest run lib/templates/config.test.ts` → PASS. **Step 5: Commit.**

---

## M1 — Gap 3: post-merge logo/photo HEAD-verify

**Root cause:** `verifyAssets` (`lib/templates/enrich/verifyAssets.ts`) runs on the *discovered* `row.record` in `src/trigger/templates/enrich.ts` BEFORE `assembleRecord` merges the Firecrawl/Facebook logo — so a dead Firecrawl/FB logo is never checked and can ship (`lib/templates/enrich/index.ts:61`).

### Task 1.1: Re-verify the merged assets
**Files:** Modify `src/trigger/templates/enrich.ts` (the child task, after `assembleRecord`); Test `lib/templates/enrich/verifyAssets.test.ts`

**Step 1 (test):** add a case: given an assembled record whose `logo.src_url` returns a non-2xx (mock `fetch` HEAD), `verifyAssets(record)` returns a record with `logo` dropped and photos pruned; a live logo survives.

**Step 2:** `npx vitest run lib/templates/enrich/verifyAssets.test.ts` → FAIL.

**Step 3 (impl):** in `enrich.ts`, after the `const record = assembleRecord(...)` call and BEFORE `scoreRecord`/persist, add:
```ts
// Gap 3: the FB/Firecrawl logo + photos are merged AFTER the initial verify,
// so re-verify the final record's assets before scoring/persisting.
const verified = await verifyAssets(record);
```
Use `verified` for scoring, `toBuildPayload`, and `persistAssets`. (No signature change to `verifyAssets` — it already prunes logo+photos.)

**Step 4:** `npx vitest run lib/templates/enrich/verifyAssets.test.ts` → PASS. Run `npx tsc --noEmit`. **Step 5: Commit** `fix(templates): re-verify merged logo/photos after enrich (gap 3)`.

---

## M2 — Gap 4: `sl_template_ready` + canonical taxonomy

### Task 2.1: Migration — add `sl_template_ready`
**Files:** Create `supabase/migrations/050_tpl_industries_sl_template_ready.sql`
```sql
-- Which tpl_industries currently have a live SL Builder template (gap 1/4).
ALTER TABLE tpl_industries ADD COLUMN IF NOT EXISTS sl_template_ready boolean NOT NULL DEFAULT false;
-- Seed the 3 industries SL serves today; the rep picker only offers ready ones.
UPDATE tpl_industries SET sl_template_ready = true
  WHERE slug IN ('hvac', 'landscaping', 'pool-service');
```
**Step:** apply with `node scripts/apply-migration.mjs supabase/migrations/050_tpl_industries_sl_template_ready.sql`; confirm the column + 3 rows flipped. **Commit.**

> As SL Builder ships `garage-door`, `roofing`, `fencing`, flip each with a one-line `UPDATE ... sl_template_ready=true` (a follow-up migration or admin action) — that is the coordinated-deploy switch.

### Task 2.2: `templateReadyIndustries()` helper + boundary doc
**Files:** Create `lib/templates/industries/registry.ts`; Test `lib/templates/industries/registry.test.ts`; Modify `lib/industries.ts` (top-of-file comment only)

**Step 1 (test):** `templateReadyIndustries(db)` returns only rows where `sl_template_ready` (mock the supabase client).

**Step 3 (impl):**
```ts
import type { TplDb } from "../db";
export interface ReadyIndustry { slug: string; display_name: string; sl_slug: string; }
export async function templateReadyIndustries(db: TplDb): Promise<ReadyIndustry[]> {
  const { data, error } = await db
    .from("tpl_industries")
    .select("slug, display_name, sl_slug")
    .eq("sl_template_ready", true)
    .order("display_name");
  if (error) throw error;
  return data ?? [];
}
export async function isTemplateReady(db: TplDb, slug: string): Promise<boolean> {
  const { data } = await db.from("tpl_industries")
    .select("sl_template_ready").eq("slug", slug).maybeSingle();
  return Boolean(data?.sl_template_ready);
}
```
Add a comment atop `lib/industries.ts`: *"Inbound sales-FORM taxonomy + reference resolution only. The canonical taxonomy for template BUILDING is `tpl_industries` (see lib/templates/industries.ts + registry.ts). Do not use this for template selection."*

**Step 4:** tests + `npx tsc --noEmit` pass. **Commit** `feat(templates): template-ready industry registry (gap 4)`.

---

## M3 — Gap 5: dollar cost estimate + per-rep/day cap

### Task 3.1: Flow cost estimate + budget check
**Files:** Create `lib/templates/cost/budget.ts`; Test `lib/templates/cost/budget.test.ts`

The `tpl_cost_events` ledger already records real spend (`stage`, `actor`, `units`, `usd`). Add a pure estimate + a per-rep/day sum check.

**Step 1 (test):** `estimateInstantPreviewUsd()` returns the fixed per-build estimate (Places details + worst-case Firecrawl-on-miss); `repSpentTodayUsd(db, repId, todayIso)` sums `tpl_cost_events` for that rep/day; `withinRepBudget` = spent + estimate ≤ cap.

**Step 3 (impl):**
```ts
import { REP_DAILY_BUDGET_USD } from "../config";
// Places details (~$0.017) + one HTML fetch (free) + worst-case Firecrawl branding (~$0.004).
export const estimateInstantPreviewUsd = () => 0.021;
export async function repSpentTodayUsd(db, repId: string, dayStartIso: string): Promise<number> {
  const { data } = await db.from("tpl_cost_events")
    .select("usd").eq("rep_id", repId).gte("created_at", dayStartIso);
  return (data ?? []).reduce((s, r) => s + Number(r.usd ?? 0), 0);
}
export function withinRepBudget(spentUsd: number): boolean {
  return spentUsd + estimateInstantPreviewUsd() <= REP_DAILY_BUDGET_USD();
}
```
> Requires a `rep_id` column on `tpl_cost_events` — add it in migration 050 (`ADD COLUMN IF NOT EXISTS rep_id text`) or a sibling migration. The rep flow (M7) passes `rep_id` when it records Places/Firecrawl cost events.

**Step 4:** tests + `tsc` pass. **Commit** `feat(templates): per-rep daily budget gate for instant preview (gap 5)`.

---

## M4 — Gap 1: template-coverage gate

### Task 4.1: Pre-dispatch guard on unsupported slugs
**Files:** Modify `lib/templates/sl/push.ts` (or a shared guard in `lib/templates/sl/toBuildPayload.ts`); Test `lib/templates/sl/push.test.ts`

**Step 1 (test):** a prospect whose `industry_slug` is NOT template-ready is excluded from the push set with a reason (`template_not_ready`); ready ones pass.

**Step 3 (impl):** in `assembleAndPush`, after loading prospects and before mapping payloads, drop (with a logged reason) any prospect whose `record.industry_slug` fails `isTemplateReady(db, slug)`. Return the skipped list in the result so the UI/rep sees "N skipped — template not ready." The rep picker (M7) already only offers ready industries; this is defense-in-depth.

**Step 4:** tests + `tsc` pass. **Commit** `feat(templates): block builds for industries without a live template (gap 1)`.

---

## M5 — Google Places interactive GBP search

### Task 5.1: Places client (autocomplete + details)
**Files:** Create `lib/templates/places/client.ts`; Test `lib/templates/places/client.test.ts`

**Step 1 (test):** mock `fetch`; `placesAutocomplete("reic h")` returns `[{ placeId, description }]`; `placeDetails(placeId)` returns normalized `{ placeId, name, website, phone, address{}, hours, categories, photoRefs }`; both throw a typed error when `googlePlacesEnabled()` is false.

**Step 3 (impl):** thin REST client for Places API (Autocomplete + Place Details), keyed by `GOOGLE_PLACES_API_KEY()`. Return only the fields we use. No LLM. Keep photo *references* (resolve to URLs lazily in M6). Record a `tpl_cost_events` row (`actor:"google-places"`, `stage:"find"`) per details call — accept a `repId` arg to stamp `rep_id`.

**Step 4:** tests + `tsc` pass. **Commit** `feat(templates): google places autocomplete + details client`.

### Task 5.2: Map Place Details → partial CanonicalRecord
**Files:** Create `lib/templates/places/mapPlaceDetails.ts`; Test `lib/templates/places/mapPlaceDetails.test.ts`

Mirror `lib/templates/apify/places.ts:mapPlaceToRecord` but from the Places API shape. Set `source_id = 'wr-gbp-{placeId}'`, populate name/address/phone/hours/website/geo; **do not** set `industry_slug` (stamped from the picked industry, like discover). Full TDD. **Commit.**

### Task 5.3: Search API route
**Files:** Create `app/api/templates/find/gbp/route.ts`

`POST { query, industrySlug }` → `requireSalesRepOrAdmin` + `templatesEnabled` gate → `placesAutocomplete` → return matches. `GET`/second route for confirm handled in M7. Follow the auth pattern in existing `app/api/templates/find/route.ts`. Manual-verify per `verifying-changes`. **Commit.**

---

## M6 — Gap 2: deterministic-first enricher

### Task 6.1: Deterministic homepage asset parse (logo + photos)
**Files:** Create `lib/templates/enrich/ogImages.ts`; Test `lib/templates/enrich/ogImages.test.ts`

**Step 1 (test):** given homepage HTML, `extractSiteAssets(html, baseUrl)` returns `{ logoUrl?, photos: string[] }` from (in priority) `<link rel="icon">`/apple-touch-icon → `og:image` → first N content `<img>`; URLs absolutized; data-URIs and tracking pixels dropped.

**Step 3 (impl):** pure HTML parse (regex/lightweight — **no LLM, no Firecrawl**). Logo candidate = apple-touch-icon / `rel=icon` / `og:logo`; photos = `og:image` + hero `<img>` by size hints. Absolutize against `baseUrl`.

**Step 4:** tests + `tsc`. **Commit** `feat(templates): deterministic site asset extraction (gap 2)`.

### Task 6.2: Deterministic palette from HTML/CSS → `brandColorsFromPalette`
**Files:** Create `lib/templates/enrich/palette.ts`; Test `lib/templates/enrich/palette.test.ts`

**Step 1 (test):** `hexesFromHtml(html)` returns the most frequent valid brand hexes (excluding near-white/near-black noise, ranked by frequency); feeding them to the existing `brandColorsFromPalette` (`lib/templates/enrich/colors.ts`) yields a 4-token `BrandColors`.

**Step 3 (impl):** extract `#rrggbb`/`#rgb` and `rgb()/hsl()` from inline styles + `<style>` blocks, normalize via `normalizeHex`, rank by frequency, drop near-grayscale extremes, return top ~6. This is the palette that **revives the currently-dead** `brandColorsFromPalette` path (gap 2).

**Step 4:** tests + `tsc`. **Commit** `feat(templates): deterministic brand palette extraction, revive brandColorsFromPalette (gap 2)`.

### Task 6.3: Per-industry default services
**Files:** Create `lib/templates/industries/defaultServices.ts`; Test alongside

`defaultServices(slug)` → a curated list per the 6 slugs (hvac, garage-door, roofing, landscaping, pool-service, fencing), used when scraped services are thin (<3). Pure map. **Commit.**

### Task 6.4: `quickEnrich` orchestrator (deterministic-first, Firecrawl-on-miss)
**Files:** Create `lib/templates/enrich/quickEnrich.ts`; Test `lib/templates/enrich/quickEnrich.test.ts`

**Step 1 (test):** given a Place Details record + fetched HTML, `quickEnrich` returns a `CanonicalRecord` with logo/colors/services/email/photos filled deterministically; when deterministic logo AND colors are both empty, it calls the Firecrawl branding fallback (mock `scrapeBrandDNA`) exactly once; email derived from a site `mailto:` when present; final assets HEAD-verified (reuse M1 `verifyAssets`).

**Step 3 (impl):** orchestrate: Place fields → `extractSiteAssets` + `hexesFromHtml`→`brandColorsFromPalette` → services (scraped else `defaultServices`) → email (mailto/Places) → assemble → **Firecrawl branding only if logo or colors still missing** → `verifyAssets(record)` → `scoreRecord`. Record `tpl_cost_events` for any Firecrawl call with `rep_id`.

**Step 4:** tests + `tsc`. **Commit** `feat(templates): deterministic-first quickEnrich for the rep flow (gap 2)`.

---

## M7 — Rep surface + single-prospect build + rep email

### Task 7.1: Confirm-and-build route
**Files:** Create `app/api/templates/find/gbp/confirm/route.ts`; Test the pure pieces it calls

`POST { placeId, industrySlug }` → auth + `templatesEnabled` → `isTemplateReady` guard (M4) → budget check (`withinRepBudget`, M3) → `placeDetails` → `mapPlaceDetails` (stamp `industry_slug` from picked industry, `source_id=wr-gbp-{placeId}`) → upsert `tpl_prospects` into the rep's `kind='sales'` campaign (reuse migration 041 machinery / `salesIntake` patterns) → `quickEnrich` → `assembleAndPush` for the single prospect (`prospectIds:[id]`, dry-run then send). Return `{ prospectId, batchId }`. Over-budget → 402 with the cap. Manual-verify per `verifying-changes`. **Commit.**

### Task 7.2: Rep email on build-complete
**Files:** Modify `app/api/templates/sl-callback/route.ts`; Create `lib/templates/mail/repBuildEmail.ts`; Test the template fn

When a C4 callback flips a prospect `→ live` (and the prospect originated from the rep flow — detect by `source_id` prefix `wr-gbp-` or a `created_by_rep` stamp), send the submitting rep a Resend email with the `preview_url`. On `build_failed`, send a failure notice. Reuse the Resend setup in `lib/task-emails.ts`. Gate on notification settings. Pure email-builder is unit-tested; the send is best-effort (never 500 the callback). **Commit.**

### Task 7.3: Rep surface (sales-rep portal)
**Files:** Create `app/sales-rep/instant/page.tsx` + a client component

Industry picker (fetches `templateReadyIndustries`) → business-name search (calls `/api/templates/find/gbp`) → result list → confirm (calls `/confirm`) → "building… we'll email you" state. Match the existing sales-rep portal auth/layout. Manual-verify per `verifying-changes` (detect-then-ask on the dev server). **Commit.**

---

## M8 — C2 `brief.photos[]` (cross-repo, gated, LAST)

> Do NOT deploy this milestone until SL Builder templates declare photo slots and `/api/builds` accepts `photos[]` (ADR 0007). It ships behind `SL_TEMPLATE_PHOTOS_ENABLED=false` by default.

### Task 8.1: Extend the brief + mapper behind the flag
**Files:** Modify `lib/templates/sl/toBuildPayload.ts`; Test `lib/templates/sl/toBuildPayload.test.ts`

**Step 1 (test):** with `slTemplatePhotosEnabled()` false, `toBuildPayload` emits NO `photos` key (byte-identical to today); with it true and `record.photos` present, `brief.photos = [{ url, slot, alt }]` mapped from `record.photos`; empty/absent photos → no key.

**Step 3 (impl):** add `photos?: { url: string; slot?: string; alt?: string }[]` to `BuildBrief`; in `toBuildPayload`, only populate it when `slTemplatePhotosEnabled()` and `record.photos?.length`. Keep the "photos not shipped" comment updated to reference the flag.

**Step 4:** tests + `tsc`. **Commit** `feat(templates): optional brief.photos[] behind SL_TEMPLATE_PHOTOS_ENABLED (C2, gap 2)`.

### Task 8.2: Update the C2 contract doc
**Files:** Modify `brain/contracts/c2-sitelaunchr-builds-wr-template.md`

Document `brief.photos[]` (shape, additive, flag-gated), the `sl_template_ready` sync, and the coordinated-deploy order. Run `/cross-repo-review` before enabling the flag in production. **Commit.**

---

## Definition of done
- `npx tsc --noEmit`, `npx eslint`, `npx vitest run` all green.
- M1–M4 mergeable independently; a rep can build a preview for a template-ready industry end-to-end (M5–M7) with zero WR-side LLM calls; deterministic enrichment fills logo/colors/services/photos with graceful fallback.
- `photos[]` stays OFF until SL confirms slot support; `/brain-health` + the C2 doc reflect the change.
- Update [brain/current-state.md](../../brain/current-state.md) + [gap-matrix.md](../../brain/gap-matrix.md) (mark G-C2 coverage gate, gaps 1–5) via `/update-brain` when the pipeline lands.

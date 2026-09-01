# Design — Rep "Instant Preview" pipeline

> Status: approved 2026-08-31 (brainstorming). Next: loop-first implementation plan (`writing-plans`).
> Scope: a new sales-rep self-serve pipeline that turns a Google Business Profile pick into a
> speculative preview site, reusing the existing `tpl_*` scrape→enrich→push→callback machinery,
> and closing gaps 1–5 from the pipeline review. Gap 6 (Click2Mail sandbox) is explicitly out of scope.

## 1. Intent
A sales rep picks an industry, types a business name, the app live-searches Google Business
Profile, the rep confirms, the app runs a **cheap, deterministic** scrape (logo, brand colors,
services, contact info, photos), fills the matching SL template, SL builds a **speculative
preview**, and the rep is emailed the preview URL. It is the single-prospect, interactive
sibling of the existing bulk campaign pipeline.

## 2. Load-bearing decisions
- **Output = speculative preview.** Rides the existing `push` + C4-callback path (`stage` →
  `live`, `preview_url` stamped). No owner data / domain / payment up front. Going live stays the
  existing `convert → Kura` (C3) step, fired later when the prospect says yes.
- **GBP lookup = Google Places API** (new integration). Autocomplete + Place Details for the
  interactive picker; returns name, website, address, phone, hours, category, and photos with **no LLM**.
- **Photos = own-site photos + per-industry stock fallback.** WR ships a new `photos[]` in the
  brief; empty slots fall back to stock bundled in the SL template. No added LLM.
- **Enrichment = deterministic-first, Firecrawl-on-miss.** Places fields + homepage HTML parse
  (`og:image`, hero `<img>`, favicon) + revived `brandColorsFromPalette`; the cheap Firecrawl
  branding scrape runs only when deterministic logo/colors come up empty (~10–20% of sites).
- **Design principle: deterministic-first, LLM-minimal.** Zero LLM on the WR side. The completer
  the brief, the less the SL template-fill LLM must generate (ideally text-mode slotting) — cheap
  enrichment here is what makes building at scale affordable.

## 3. Division of labor
- **SL repo (`sitelaunchr-builder`):** rebuild 6 templates (`hvac`, `garage-door`, `roofing`,
  `landscaping`, `pool-service`, `fencing`). Each declares its `industries[]` (matching WR's
  `sl_slug`), keeps a small/chunked text-mode fill-schema (fixes the G-C2c 400 class), and
  declares hero/gallery photo slots with per-industry stock fallback. Handled by a separate SL
  agent via the `bespoke-ui` skill, one reference per niche.
- **WR repo (this repo):** the rep surface, Places integration, deterministic enricher, the
  `photos[]` brief field, the template-coverage gate, taxonomy consolidation, cost ledger + cap,
  and the rep email. Detailed below.

## 4. The rep flow (WR)
1. **Industry picker** — reads `tpl_industries` filtered to `sl_template_ready = true` (gap 1
   gate; makes `tpl_industries` the canonical template taxonomy = gap 4).
2. **Business search** — new `POST /api/templates/find/gbp` → Google Places Autocomplete, then
   Place Details on confirm. Yields name, website, address, phone, hours, category, place photos.
3. **Quick enrich (deterministic-first)** — Places fields + homepage HTML parse + revived
   `brandColorsFromPalette`; Firecrawl branding only on miss. Services = category + per-industry
   defaults. Deterministic email from site `mailto:` / Places. Every image URL **HEAD-verified
   after the merge** (fixes gap 3). Photos assembled into `photos[]`.
4. **Build** — reuse `toBuildPayload` (now emits `photos[]`) → single `push` → SL builds preview
   → C4 callback flips `stage` to `live`, stamps `preview_url`.
5. **Notify** — Resend email to the submitting rep with the `preview_url` on `live` (or a failure
   notice on `build_failed`).

## 5. Data model — reuse, don't rebuild
The rep's business is a normal `tpl_prospects` row (`source_id = wr-gbp-{place_id}`) inside that
rep's existing `kind='sales'` campaign (migration 041 machinery). No parallel tables. New:
`tpl_industries.sl_template_ready` (bool). `tpl_cost_events` logs Places + Firecrawl spend (gap 5).

## 6. Gap closures folded in
- **Gap 1 (template coverage):** `sl_template_ready` on `tpl_industries` drives the picker and a
  pre-dispatch guard; WR never ships an unsupported slug.
- **Gap 2 (thin sites):** `photos[]` in the brief + revived deterministic colors + services from
  category-defaults + deterministic email — all zero-LLM. Prospects build full-looking sites.
- **Gap 3 (dead logo ships):** move HEAD-verification to after the logo/photo merge in `assembleRecord`.
- **Gap 4 (two taxonomies):** `tpl_industries` becomes the single canonical template taxonomy;
  `lib/industries.ts` relegated to inbound-form references only; boundary documented.
- **Gap 5 (cost gate):** dollar ledger in `tpl_cost_events` + a per-rep/day cap guarding runaway.

## 7. Contract & cost
- **C2 change:** brief gains `photos[]`; `industries[]`↔`sl_slug` sync tightens. Needs an ADR +
  `/cross-repo-review` + coordinated deploy. WR must not send `photos[]` until templates accept it.
- **Cost/build:** ~1–2 Places requests + free HTML fetch + Firecrawl only on the ~10–20% misses +
  the SL build. Zero LLM WR-side; minimized SL-side via a complete brief + text-mode fill.

## 8. Loop-first framing
One new loop: goal = a live preview for the chosen business; executor = pick → enrich → push;
evaluator = build reaches `live` with a non-empty `preview_url`, else `build_failed`; retry =
`retry:true` rebuild; escalation = email the rep on done/failure; observability = `tpl_cost_events`
+ sales board + Dispatchr event. Satisfies the Loop Engineering Constitution.

## 9. Open items for the plan
- Google Places API billing/key provisioning + a `GOOGLE_PLACES_*` config accessor.
- Exact `photos[]` shape finalization with SL (`{ url, slot, alt }`).
- Where the rep surface lives (sales-rep portal vs admin templates) — assumed sales-rep portal.
- ADR for the C2 `photos[]` addition + the `sl_template_ready` sync.

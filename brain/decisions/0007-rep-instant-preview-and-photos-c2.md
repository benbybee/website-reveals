# 0007 — Rep instant-preview loop + optional `brief.photos[]` (C2 change)

- Status: **proposed** (2026-08-31). Implements [docs/plans/2026-08-31-rep-instant-preview-plan.md](../../docs/plans/2026-08-31-rep-instant-preview-plan.md) (design: [2026-08-31-rep-instant-preview-design.md](../../docs/plans/2026-08-31-rep-instant-preview-design.md)).
- Date: 2026-08-31
- Deciders: WR maintainer, operator; SiteLaunchr maintainer (cross-repo half — `brief.photos[]` + template photo slots)
- Tier impact: none (Tier 3 unchanged; no new distributed *system*, one additive field on an existing seam)
- Contracts touched: [C2](../contracts/c2-sitelaunchr-builds-wr-template.md) (`wr-template` builds — gains optional `brief.photos[]`)

## Context
Reps have no self-serve way to turn a prospect they are talking to into a speculative preview site. The bulk `tpl_*` pipeline (scrape → enrich → `toBuildPayload` → `push` → C4 callback) already produces exactly this artifact, but only in batch from an Apify scrape. A rep who has a specific business in mind cannot drive one build interactively.

A pipeline review also surfaced five gaps in the existing `tpl_*` flow:

1. **Template coverage** — WR can dispatch a build for an industry SL has no template for; it fails at template selection.
2. **Thin sites** — a prospect with a sparse website yields an empty-looking build (no logo, no colors, no photos, no services).
3. **Dead logo ships** — `verifyAssets` HEAD-checks the *discovered* record, but the Firecrawl/Facebook logo is merged in *after* that check (`assembleRecord`), so a dead merged logo is never re-verified and can ship.
4. **Two taxonomies** — `lib/industries.ts` (inbound-form references) and `tpl_industries` (template building) both look authoritative; nothing marks which is canonical for template *selection*.
5. **No cost gate** — `tpl_cost_events` records real spend but nothing estimates a flow's cost or caps a rep's daily spend, so an interactive flow could run away.

## Decision
Add a **new interactive loop** on top of the existing machinery, and fold the five gap closures into it. No parallel tables, no WR-side LLM.

**The loop (Loop Engineering Constitution):**
- **Goal:** a live speculative preview (`stage='live'`, non-empty `preview_url`) for a rep-chosen business.
- **Executor:** industry pick → Google Business Profile search (Google Places API) → deterministic quick-enrich → single `push` to SL.
- **Evaluator:** the C4 callback flips the prospect to `live` with a `preview_url`; otherwise `build_failed`.
- **Retry:** the existing `retry:true` rebuild path.
- **Escalation:** Resend email to the submitting rep on `live` (preview URL) or on `build_failed` (failure notice).
- **Observability:** `tpl_cost_events` (Places + Firecrawl spend, stamped with `rep_id`), the sales board, and the existing Dispatchr event.

**Data model — reuse, don't rebuild.** The rep's business is an ordinary `tpl_prospects` row (`source_id = 'wr-gbp-{place_id}'`) inside that rep's existing `kind='sales'` campaign (migration 041 machinery). New columns only: `tpl_industries.sl_template_ready` (bool — which industries have a live SL template, drives the picker + a pre-dispatch guard) and `tpl_cost_events.rep_id` (per-rep spend attribution).

**Enrichment — deterministic-first, LLM-minimal.** Google Places fields + homepage HTML parse (favicon / `apple-touch-icon` / `og:image` / hero `<img>`) + the revived `brandColorsFromPalette` path (currently dead) for colors + per-industry default services + a `mailto:`/Places-derived email. The cheap Firecrawl branding scrape runs **only** when the deterministic logo *and* colors both come up empty (~10–20% of sites). Every image URL is HEAD-verified **after** the merge (closes gap 3). Zero LLM on the WR side; a completer brief also shrinks what the SL template-fill LLM must generate.

**Gap closures folded in:** (1) `sl_template_ready` drives the picker *and* a pre-dispatch guard so WR never ships an unsupported slug; (2) `photos[]` + revived colors + default services + deterministic email make thin sites build full; (3) HEAD-verify moves after the merge; (4) `tpl_industries` becomes the single canonical template taxonomy and `lib/industries.ts` is relegated (documented) to inbound-form references only; (5) a dollar estimate + a per-rep/day cap guard runaway.

**C2 contract change — optional `brief.photos[]`.** The brief gains an optional `photos?: { url, slot?, alt? }[]`. It is **additive** and **gated by `SL_TEMPLATE_PHOTOS_ENABLED`** (default `false`). WR **must not** send `photos[]` until the SL Builder templates declare photo slots and `/api/builds` accepts the field. Empty slots fall back to stock bundled in the SL template. This is the one cross-repo change and it ships **last**, behind the flag.

## Consequences
- **Easier:** a rep self-serves a speculative preview in one interactive flow; thin prospects build full-looking sites; a dropped/dead logo no longer ships; template-selection failures are caught pre-dispatch; runaway spend is capped per rep/day; `tpl_industries` is unambiguously canonical for template selection.
- **New surface / harder:** a Google Places integration (new key + billing) and a per-rep budget ledger read. One additive C2 field requires cross-repo coordination.
- **Coordinated deploy (C2):** this ADR → `/cross-repo-review` → coordinated deploy. `SL_TEMPLATE_PHOTOS_ENABLED` stays `false` in WR production until SL confirms its templates declare photo slots and `/api/builds` accepts `photos[]`. `sl_template_ready` is flipped per-industry (a one-line `UPDATE`) only *after* SL ships that industry's template — the same coordinated-deploy switch.
- **Amends C2:** the "**Photos are NOT shipped**" note becomes "photos optional behind `SL_TEMPLATE_PHOTOS_ENABLED`, additive, off until SL declares slots." The C2 doc's payload shape + supported-industries sync must be updated on acceptance (plan M8.2).
- **Must revisit:** the fixed per-build cost estimate against real Places + Firecrawl spend; the `photos[]` slot vocabulary once SL finalizes template slots.

## Alternatives considered
- **New parallel tables for rep prospects.** Rejected: the rep's business *is* a `tpl_prospects` row; a parallel model would fork the enrich/push/callback machinery and the sales board. Reuse keeps one pipeline.
- **LLM enrichment (scrape → LLM → brief).** Rejected as the default: it is the expensive path and the design principle is deterministic-first. LLM stays out of the WR side entirely; Firecrawl is the only paid fallback and only on deterministic miss.
- **Ship `photos[]` immediately (no flag).** Rejected: sending a field SL templates don't yet accept would fail builds or be silently dropped. Additive + flag-gated + coordinated-deploy is the only safe order — WR leads with the field OFF.
- **Bake photos into templates only (no `brief.photos[]`).** Partial: stock fallback already lives in templates, but a prospect's *own* photos materially improve the preview. `photos[]` carries own-site imagery; stock fills the empty slots.

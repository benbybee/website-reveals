# L2 — Ingestion Loop (scrape → enrich → qualify)

**Goal:** Turn a campaign's `(industry, state, locations)` into a list of qualified, brand-enriched prospects ready to push as preview sites.

**Executor:** `tpl-discover` (Apify Google Places scrape → `tpl_prospects` as `scraped`) chains into `tpl-enrich`, a **parent** that fans out `tpl-enrich-batch` children (bounded batch size, bounded concurrency). Each child verifies assets, best-effort Facebook (Apify) + brand DNA (Firecrawl), derives services, scores, and persists. See [ADR 0003](../decisions/0003-enrich-fan-out.md).

**Evaluator (L2):** `scoreRecord()` ([`lib/templates/score/gate.ts`](../../lib/templates/score/gate.ts)) — REQUIRED = `source_id, business_name, industry_slug, address(street+city+state+zip), phone`. `missing == []` → `qualified`; else → `incomplete`. Soft optionals (logo, photos, hours, services, brand_colors, email) feed a 0–1 completeness score but never block.

**Retry:** per-prospect best-effort (a dead site/Facebook never disqualifies). **Claim-stale orphan recovery** ([Runtime Loop Standard](../standards/runtime-loop-standard.md) + [Pattern P8](../standards/pattern-library.md)): a child claims a prospect by flipping it to `enriching` with a fresh `updated_at`; runs only re-select `enriching` rows older than the stale threshold (`ORPHAN_STALE_MS` in `lib/templates/enrich/batch.ts`), so concurrent runs never double-process an in-flight row.

**Escalation / gate:** whole-batch failure (vs. per-prospect attrition) sets the campaign `status = error` via the parent's `onFailure` + failed-batch accounting, instead of stranding it in `enriching`. Operator re-runs.

**Approval gate:** none automated; qualification is the gate to becoming pushable.

**Observability:** `tpl_prospects.stage` + `completeness`, `tpl_cost_events` (append-only Apify/Firecrawl ledger), Trigger run logs, campaign rollup counts.

**Runtime states:** `scraped`→pending, `enriching`→running(claim), `qualified`→succeeded, `incomplete`→held, campaign `error`→escalated.

**Gaps:** no per-campaign budget/cost gate (G-BUD1); cost recorded post-facto; no circuit-breaker on Apify/Firecrawl degradation; deterministic gate not configurable per industry. See [gap matrix](../gap-matrix.md).

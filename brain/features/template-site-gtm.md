# Feature — Template Site GTM Pipeline

> The outbound machine: scrape businesses → enrich → qualify → speculative preview site → postcard → convert. Everything `tpl_*`. This is the repo's most active area.

## Flow
1. **Campaign** (`tpl_campaigns`): operator defines `(industry_slug, state, locations, target_count)`. `kind` = `discovery` (scrape) or `sales` (rep submission bucket).
2. **Discover** (`tpl-discover`, Apify Google Places) → `tpl_prospects(scraped)` + `tpl_cost_events`.
3. **Enrich** (`tpl-enrich` → `tpl-enrich-batch`): asset verify + Facebook (Apify) + brand DNA (Firecrawl) + service derivation. Fanned-out, claim-stale recovery ([ADR 0003](../decisions/0003-enrich-fan-out.md), [L2](../loops/ingestion-scrape.md)).
4. **Qualify** (`scoreRecord()` gate): `qualified` vs `incomplete`. CRM table filters on DNA/address completeness for clean-list export ([ADR 0004](../decisions/0004-prospect-filters-single-source.md)).
5. **Push** (`/campaigns/[id]/push`, [C2](../contracts/c2-sitelaunchr-builds-wr-template.md)): dry-run → send qualified prospects as preview builds (source `wr-template`). Callback (C4) moves them `building`→`live`.
6. **Mail** (`/campaigns/[id]/mail`, `tpl-mail-campaign`): Lob or Click2Mail postcard with a QR code; `tpl_mailings` (one per prospect ever). Dry-run cost gate first.
7. **Track**: QR scans (`/r/[token]` → `tpl_qr_scans`), calls (`tpl_sales_activity`), denormalized rollups power the sales board.
8. **Convert** (`/prospects/[id]/convert`, [C3](../contracts/c3-sitelaunchr-conversions.md)): rep captures owner data; signed conversion → SL dispatches the **Kura promote**.

## Key invariants
- `tpl_prospects.record` JSONB is canonical; promoted columns are denormalized; the SL payload maps from `record` only.
- `brief.industry` MUST be the SL `sl_slug` (template selector) — `industry_raw` is cosmetic.
- `source_id` (= SL `external_id`) is the dedup key across discover/enrich/push/convert.
- Photos stay WR-internal; only business info + logo + colors ship to SL.

## Roles
admin (campaigns, designs, addresses, mailing, conversions) · sales-rep (submit `/sales`, log calls, convert) · cron (Trigger tasks) · recipient (public QR).

## Gaps
budget gate (G-BUD1), mail partial-send recovery (G-MAIL1), template-slug feedback loop (G-C2), conversion retry (G-C3). See [gap matrix](../gap-matrix.md).

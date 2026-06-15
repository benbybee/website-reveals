# 0003 — Fan out enrich into bounded child batches

- Status: accepted (retroactive — records existing implementation)
- Date: 2026-06-11 (decision predates the brain)
- Deciders: engineering
- Tier impact: none
- Contracts touched: none (internal)

## Context
The original `tpl-enrich` enriched all of a campaign's prospects in one sequential Trigger run (~11s/prospect: asset checks + Facebook + Firecrawl). A 400-prospect campaign needed ~73 min and was killed by the task `maxDuration` (~30 min) with `maxAttempts:1`, stranding ~235 prospects in `scraped` and the campaign stuck in `enriching` with zeroed counts. Larger campaigns were planned.

## Decision
Make `tpl-enrich` a **parent** that keyset-pages prospect IDs, partitions them into small **child batches** (`tpl-enrich-batch`, bounded size + bounded concurrency), waits checkpointed (batch wait does not count toward `maxDuration`), and rolls up results. Children claim each prospect by flipping it to `enriching` with a fresh `updated_at`; only **stale** `enriching` rows (older than `ORPHAN_STALE_MS`) are re-selected, so concurrent runs and crash orphans never double-process. ([Pattern P7](../standards/pattern-library.md) + [P8](../standards/pattern-library.md); [L2](../loops/ingestion-scrape.md).)

## Consequences
- Easier: campaign size no longer races the duration limit; failures isolate per prospect and per batch; parallelism cuts wall-clock.
- Added: parent `onFailure` sets the campaign to `error` instead of stranding it in `enriching`; failed-batch accounting surfaces systemic failure.
- New surface: claim-stale recovery must keep `ORPHAN_STALE_MS` > child `maxDuration` or a live claim could be mistaken for an orphan.

## Alternatives considered
- **Raise `maxDuration`:** rejected — a shortcut that fails again at the next campaign size and keeps a single point of failure (named as debt at decision time).
- **Per-prospect one-task-each:** rejected — far more runs, batch-rate-limit pressure, no batch-level rollup.

# 0004 — Single-source prospect record edits + DNA/address filters

- Status: accepted (retroactive — records existing implementation)
- Date: 2026-06-11 (decision predates the brain)
- Deciders: engineering
- Tier impact: none
- Contracts touched: none (internal; affects what is later mapped to [C2](../contracts/c2-sitelaunchr-builds-wr-template.md))

## Context
The prospect CRM needed filters to export a "clean list" (prospects that HAVE brand DNA = logo + primary color, and HAVE a full mailable address). The only existing filter selected prospects *missing* a completeness field, and a dead `logo_or_photos` option matched nothing. Separately, drawer edits (city/business name) wrote only the promoted columns, while scoring, the SL build payload, mail, and these filters all read the canonical `record` JSONB — so a rep's correction never reached the canonical source.

## Decision
1. Add tri-state `dna` and `address` filters (has/missing/any) via one shared helper used by BOTH the list and CSV export, so "export what you're looking at" cannot drift.
2. Make drawer edits **mirror into `record`** (single source of truth), add street/zip inputs, and source the exported address entirely from `record`.

## Consequences
- Easier: a clean mailable list is one filter + export; rep corrections now flow to scoring, SL payloads, and mail.
- Fixed in passing: pagination reset on filter change; export no longer caps silently at 1000 rows.
- Invariant established: `tpl_prospects.record` is canonical; promoted columns are a denormalized projection that must be kept consistent with it.

## Alternatives considered
- **Filter on promoted columns:** rejected — street/zip live only in `record`; mixing sources lets list and CSV disagree.
- **Leave drawer writing only columns:** rejected — it silently diverges canonical truth from what reps see.

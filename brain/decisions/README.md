# Decisions (ADRs)

Architecture Decision Records — why WR is shaped the way it is. Format & lifecycle: [ADR Framework](../standards/adr-framework.md). Append-only; a reversal gets a new ADR that supersedes the old.

| # | Title | Status |
|---|---|---|
| [0001](./0001-tier-3-classification.md) | Classify Website Reveals as Tier 3 | accepted |
| [0002](./0002-sitelaunchr-hmac-and-two-sources.md) | One HMAC scheme, two SL source identities (`wr`, `wr-template`) | accepted |
| [0003](./0003-enrich-fan-out.md) | Fan out enrich into bounded child batches | accepted |
| [0004](./0004-prospect-filters-single-source.md) | Single-source prospect record edits + DNA/address filters | accepted |
| [0005](./0005-no-payment-gate-v1.md) | No payment/Stripe gate on conversion in v1 | accepted |

> ADRs 0002–0005 are **retroactive** — they record decisions already implemented in the codebase, captured during the brain bootstrap so the "why" is not lost. 0001 is the bootstrap's own classification decision.

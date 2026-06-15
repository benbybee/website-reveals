# 0005 — No payment/Stripe gate on conversion in v1

- Status: accepted (retroactive — records existing operator decision)
- Date: 2026-06-11 (decision predates the brain; operator decision 2026-06-03)
- Deciders: operator
- Tier impact: none
- Contracts touched: [C3](../contracts/c3-sitelaunchr-conversions.md)

## Context
Stage-2 conversion ([C3](../contracts/c3-sitelaunchr-conversions.md)) promotes a speculative preview into a real Kura site for a paying owner. A payment gate (Stripe) before conversion was considered. Per the operator decision recorded inline in `app/api/templates/prospects/[id]/convert/route.ts` ("no Stripe/payment in v1 — operator decision, PIPELINE-COORDINATION.md §7"), v1 ships without it.

## Decision
In v1, a **sales rep manually marks a prospect converted**; that action captures owner data and fires the signed conversion. There is no automated payment gate before the Kura promote.

## Consequences
- Easier: faster path to onboard a "yes"; rep judgment is the gate.
- Accepted debt: the irreversible-action gate ([Constitution Article IV](../standards/loop-engineering-constitution.md)) is a **human** (the rep), not a payment confirmation. If conversions must be payment-gated later, that is a new ADR adding a gate before `postConversion` — a build-onto, not a rebuild.
- Conversion remains idempotent on `external_id`, so a mistaken convert is recoverable on the SL side.

## Alternatives considered
- **Stripe gate before conversion:** deferred to a later version, not rejected — explicitly a v2+ build-on.

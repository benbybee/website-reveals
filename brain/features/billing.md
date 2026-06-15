# Feature — Billing & Invoicing

> Per-build cost attribution + client invoicing. Detailed loop: [L5](../loops/billing-invoicing.md).

## How cost is determined (priority)
1. **SL-reported `cost_usd`** on the `phase=live` callback ([C4](../contracts/c4-sitelaunchr-callbacks.md)) — stored verbatim. Preferred.
2. **Token usage** (`usage{input/output/cache_*}`) — priced by `lib/anthropic-pricing.ts` `MODEL_RATES` (unknown model → Sonnet fallback + warning). Stored for audit.
3. **Duration estimate** (`estimateBuildCost`) — `base × (duration/target) × jitter`, clamped `[base×0.4, base×2.2]`. **Current default** because SL has not yet shipped cost fields (G-C4); on long builds the clamp pins it flat (~$8.80).

## Invoicing
`admin/billing/invoices` (POST) sums a client/period's builds, applies the markup, links `build_jobs.invoice_id`, emits an `invoice_number` (e.g. `INV-2026-05-sales-001`). `invoices.paid` is a manual boolean (`[id]/paid`).

## Markup — reconcile
The [SL cost contract](../../docs/integrations/sl-callback-cost-contract.md) documents **`BILLING_MARKUP` 2.5×**; the discovery pass found a code path referencing **1.25×**. These disagree — confirm the authoritative value in `lib/billing.ts` and reconcile this doc + [handoff open questions](../handoff.md). (The bootstrap does not change code.)

## Gaps
- G-C4 (real attribution blocked on SL), G-EST1 (unseeded jitter changes recomputed cost), no segregation-of-duty gate before invoicing, no audit trail on manual `cost_usd` overrides. See [gap matrix](../gap-matrix.md).

# L5 — Billing / Invoicing Loop

**Goal:** Attribute each build's real cost and turn it into a client invoice with the agency markup applied.

**Executor:** SL `phase=live` callback ([C4](../contracts/c4-sitelaunchr-callbacks.md)) writes cost into `build_jobs`; `app/api/admin/billing/invoices` (POST) sums builds for a client/period, applies the markup, links `build_jobs.invoice_id`. Pricing helpers: `lib/billing.ts`, `lib/anthropic-pricing.ts`.

**Evaluator (L1 structural):** cost is considered "real" when the `phase=live` callback carries `cost_usd` (stored verbatim) or `usage{}` tokens (priced via `anthropic-pricing.ts`). If both, `cost_usd` wins. Invoice total = `sum(cost_usd) × markup`.

**Retry / fallback:** if SL sends no cost fields, WR falls back to `estimateBuildCost` (duration × base × jitter, clamped). This is the current default until SL ships cost reporting (G-C4).

**Escalation / gate:** none automated — an admin manually creates invoices from a build list. There is no segregation-of-duty gate between build creation and invoicing.

**Approval gate:** invoice creation is an explicit admin action; `invoices.paid` is a manual boolean flip.

**Observability:** `build_jobs.cost_usd` / token columns / `model`; `invoices` (number, source, period, total, paid).

**Runtime states:** build cost: estimated → (callback) actual; invoice: unpaid → paid.

**Gaps:**
- **G-C4 (High):** real attribution blocked on SL — `cost_usd` is a clamped duration estimate meanwhile (~$8.80 flat on long builds).
- **G-EST1 (Low):** duration estimate uses unseeded jitter, so recomputing changes the value.
- Markup value is documented as **2.5×** in the [cost contract](../../docs/integrations/sl-callback-cost-contract.md) but one code path references 1.25× — **reconcile** (see [handoff](../handoff.md) open questions).
- No audit trail on manual `cost_usd` overrides.

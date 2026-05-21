// Multiplier applied to build_jobs.cost_usd to produce the billable amount.
// cost_usd currently underestimates real Anthropic spend by ~50% (actual is
// $9-13 per build, cost_usd averages ~$5). At 2.5× the average billable
// lands at $12.50 — at the midpoint of actual cost — keeping us above cost
// on a typical 20-25 minute build without the bigger spread 3.0× produced.
// Drop this toward 1.25-1.4× once the cost basis env vars
// (SITELAUNCHR_COST_QUICK / _STANDARD / _IN_DEPTH) are recalibrated so
// cost_usd tracks reality directly.
// The markup is intentionally NOT shown on the invoice itself.
export const BILLING_MARKUP = 2.5;

export const INVOICE_BUSINESS_NAME = "Ben Bybee";

export function billableFor(costUsd: number | null | undefined): number {
  if (costUsd == null) return 0;
  return costUsd * BILLING_MARKUP;
}

export function formatUsd(amount: number | null | undefined): string {
  const n = typeof amount === "number" ? amount : 0;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function monthLabel(year: number, month: number): string {
  // month is 1-12
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function nextInvoiceNumber(source: string, year: number, month: number, seq: number): string {
  const mm = String(month).padStart(2, "0");
  const nn = String(seq).padStart(3, "0");
  return `INV-${year}-${mm}-${source}-${nn}`;
}

// 25% markup on top of actual Claude Code API cost.
// Stored as a multiplier so cost_usd * MARKUP = billable amount.
// The markup is intentionally NOT shown on the invoice itself.
export const BILLING_MARKUP = 1.25;

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

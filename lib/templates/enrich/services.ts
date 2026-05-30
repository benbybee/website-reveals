import type { ServiceItem } from "../types";

/**
 * Derive a deduped services[] from GBP categories/attributes plus an optional
 * Facebook "services" list. SL flagged real services as the highest-value field
 * for killing /services-page hallucination, so we keep whatever the sources give
 * us verbatim (name-cased), deduping case-insensitively by name.
 */
export function deriveServices(
  gbpCategories: string[] = [],
  fbServices: Array<string | ServiceItem> = [],
): ServiceItem[] {
  const out: ServiceItem[] = [];
  const seen = new Set<string>();

  const push = (name: string | undefined, description?: string) => {
    const n = (name ?? "").trim();
    if (!n) return;
    const key = n.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(description ? { name: n, description } : { name: n });
  };

  for (const c of gbpCategories) push(c);
  for (const s of fbServices) {
    if (typeof s === "string") push(s);
    else push(s?.name, s?.description);
  }

  return out;
}

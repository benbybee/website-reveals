import { normalizeZip } from "./find/match";
import type { CanonicalRecord } from "./types";

/**
 * The denormalized tpl_prospects columns that mirror fields from the canonical
 * `record` JSONB (for CRM filtering/sorting and the public /join lookup). Derive
 * them in ONE place so every write path (discover insert + refresh, enrich) stays
 * in sync. In particular `zip` — the /join ZIP-confirm step matches on this
 * column, so a write path that forgets it makes freshly-built leads unconfirmable.
 */
export function promotedColumns(record: Partial<CanonicalRecord>) {
  return {
    business_name: record.business_name || null,
    city: record.address?.city || null,
    state: record.address?.state || null,
    zip: normalizeZip(record.address?.zip ?? "") || null,
    phone: record.phone || null,
    website: record.website || null,
    website_status: record.website_status ?? "none",
  };
}

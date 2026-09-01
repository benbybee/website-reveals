import type { CanonicalRecord } from "../types";
import type { PlaceDetails } from "./client";

/**
 * Map normalized Place Details → a partial CanonicalRecord for the rep flow.
 *
 * source_id = `wr-gbp-{placeId}` — a distinct prefix from discover's `wr-tpl-*`
 * and sales' `wr-sales-*`, so the C4 callback can detect rep-originated builds
 * (M7.2). industry_slug is intentionally NOT set here — it's stamped from the
 * industry the rep picked (= that tpl_industries row's sl_slug), exactly like
 * discover stamps it from the campaign. categories[0] is kept as the cosmetic
 * industry_raw only.
 */
export function mapPlaceDetails(d: PlaceDetails): Partial<CanonicalRecord> {
  const rec: Partial<CanonicalRecord> = {
    source_id: `wr-gbp-${d.placeId}`,
    business_name: d.name,
    address: { ...d.address },
    website_status: d.website ? "has_site" : "none",
    sources: ["google-places"],
  };
  if (d.phone) rec.phone = d.phone;
  if (d.website) rec.website = d.website;
  if (d.geo) rec.geo = d.geo;
  if (d.hours?.length) rec.hours = d.hours;
  if (d.categories[0]) rec.industry_raw = d.categories[0];
  return rec;
}

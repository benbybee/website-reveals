import type { CanonicalRecord, HoursEntry, Weekday, PhotoAsset } from "../types";
import { toE164 } from "../normalize/phone";
import { toStateAbbr } from "../normalize/state";
import { absolutize } from "../normalize/url";
import { sourceId } from "../normalize/sourceId";
import { parse12h } from "../normalize/hours";

// Raw item shape from compass/crawler-google-places (only the fields we read).
export interface PlaceItem {
  title?: string;
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  countryCode?: string;
  phone?: string;
  phoneUnformatted?: string;
  website?: string;
  categoryName?: string;
  categories?: string[];
  location?: { lat?: number; lng?: number };
  openingHours?: { day?: string; hours?: string }[];
  imageUrl?: string;
  placeId?: string;
  description?: string | null;
  scrapedAt?: string;
}

const DAY_MAP: Record<string, Weekday> = {
  monday: "mon", tuesday: "tue", wednesday: "wed", thursday: "thu",
  friday: "fri", saturday: "sat", sunday: "sun",
};

/** Normalize a GBP clock token ("8 AM", "8:30 AM") → "HH:MM", or null. */
function gbpTime(raw: string): string | null {
  const t = raw.trim();
  const withMin = /\d:\d{2}/.test(t) ? t : t.replace(/^(\d{1,2})\s*([AaPp][Mm])$/, "$1:00 $2");
  return parse12h(withMin);
}

/** Map one GBP openingHours row ({day, hours}) → a canonical HoursEntry. */
function mapHoursRow(row: { day?: string; hours?: string }): HoursEntry | null {
  const day = DAY_MAP[(row.day ?? "").trim().toLowerCase()];
  if (!day) return null;
  const hours = (row.hours ?? "").trim();
  if (!hours || /^closed$/i.test(hours)) return { day, closed: true };
  if (/open 24 hours/i.test(hours)) return { day, open: "00:00", close: "23:59" };
  const parts = hours.split(/\s+to\s+/i);
  if (parts.length !== 2) return null;
  const open = gbpTime(parts[0]);
  const close = gbpTime(parts[1]);
  if (!open || !close) return null;
  return { day, open, close };
}

/**
 * Map a Google Places result item → a partial CanonicalRecord. industry_slug is
 * intentionally NOT set here — it comes from the campaign's industry config.
 */
export function mapPlaceToRecord(item: PlaceItem): Partial<CanonicalRecord> {
  const rec: Partial<CanonicalRecord> = {};

  if (item.placeId) rec.source_id = sourceId(item.placeId);
  if (item.title) rec.business_name = item.title;
  if (item.categoryName) rec.industry_raw = item.categoryName;

  rec.address = {
    street: item.street ?? "",
    city: item.city ?? "",
    state: toStateAbbr(item.state) ?? "",
    zip: item.postalCode ?? "",
    country: item.countryCode ?? "US",
  };

  const phone = toE164(item.phoneUnformatted ?? item.phone);
  if (phone) rec.phone = phone;

  const website = absolutize(item.website);
  if (website) rec.website = website;
  rec.website_status = website ? "has_site" : "none";

  if (typeof item.location?.lat === "number" && typeof item.location?.lng === "number") {
    rec.geo = { lat: item.location.lat, lng: item.location.lng };
  }

  if (Array.isArray(item.openingHours)) {
    const hours = item.openingHours.map(mapHoursRow).filter((h): h is HoursEntry => h !== null);
    if (hours.length) rec.hours = hours;
  }

  if (item.imageUrl) {
    const hero: PhotoAsset = { slot: "hero", src_url: item.imageUrl };
    rec.photos = [hero];
  }

  if (item.description) rec.description = item.description;
  if (item.scrapedAt) rec.scraped_at = item.scrapedAt;
  rec.sources = ["google-places"];

  return rec;
}

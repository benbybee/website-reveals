import type { CanonicalRecord } from "../types";
import { scoreRecord, type ScoreResult } from "../score/gate";
import { deriveServices } from "./services";
import { brandColorsFromPalette } from "./colors";

export interface AssembleInput {
  /** Partial record from the places mapper. */
  place: Partial<CanonicalRecord>;
  /** Best-effort enrichment from the Facebook mapper (may be empty / absent). */
  facebook?: Partial<CanonicalRecord>;
  /** GBP categories for services derivation. */
  gbpCategories?: string[];
  /** Candidate logo palette for brand-color derivation. */
  palette?: string[];
  /** Controlled-vocabulary industry slug from the campaign config. */
  industrySlug: string;
}

export interface AssembleOutput {
  record: CanonicalRecord;
  score: ScoreResult;
}

/** Take the first non-empty of a list of candidate values. */
function firstNonEmpty<T>(...vals: (T | undefined | null)[]): T | undefined {
  for (const v of vals) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    return v;
  }
  return undefined;
}

/**
 * Pure enrichment assembly: merge Facebook into the place record (filling gaps
 * only, never overwriting non-empty GBP values), derive services, apply brand
 * colors, stamp industry_slug, then score. Asset verification happens upstream
 * (the Trigger task drops dead URLs before calling this), so this stays pure.
 */
export function assembleRecord(input: AssembleInput): AssembleOutput {
  const { place, facebook = {}, gbpCategories = [], palette = [], industrySlug } = input;

  const record: CanonicalRecord = {
    source_id: place.source_id ?? "",
    business_name: place.business_name ?? "",
    industry_slug: industrySlug,
    industry_raw: place.industry_raw,
    address: place.address ?? { street: "", city: "", state: "", zip: "", country: "US" },
    phone: place.phone ?? "",
    website: place.website,
    website_status: place.website_status,
    geo: place.geo,
    hours: firstNonEmpty(place.hours, facebook.hours),
    scraped_at: place.scraped_at,
    email: firstNonEmpty(place.email, facebook.email),
    logo: firstNonEmpty(place.logo, facebook.logo),
    description: firstNonEmpty(place.description, facebook.description),
    socials: firstNonEmpty(place.socials, facebook.socials),
  };

  // Photos: keep place (hero) photos, append FB photos that add new slots.
  const placePhotos = place.photos ?? [];
  const fbPhotos = (facebook.photos ?? []).filter(
    (p) => !placePhotos.some((pp) => pp.slot === p.slot),
  );
  const photos = [...placePhotos, ...fbPhotos];
  if (photos.length) record.photos = photos;

  const services = deriveServices(gbpCategories);
  if (services.length) record.services = services;

  const colors = brandColorsFromPalette(palette);
  if (colors) record.brand_colors = colors;

  const sources = new Set<string>([...(place.sources ?? [])]);
  if (facebook.logo || facebook.description || facebook.socials?.facebook) sources.add("facebook");
  record.sources = [...sources];

  const score = scoreRecord(record);
  record.confidence = score.confidence;

  return { record, score };
}

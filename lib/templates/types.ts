// Canonical record — WR-internal shape stored in tpl_prospects.record.
// This is the source of truth the SL `prep.brief` mapper reads from.

export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export type HoursEntry =
  | { day: Weekday; open: string; close: string }
  | { day: Weekday; closed: true };

export interface Address {
  street: string;
  city: string;
  state: string; // 2-letter
  zip: string;
  country: string; // "US"
}

export interface ServiceItem {
  name: string;
  description?: string;
}

export interface LogoAsset {
  src_url: string;
  width?: number;
  height?: number;
}

export interface PhotoAsset {
  slot: string; // hero | about | service-1 ...
  src_url: string;
  alt?: string;
  credit?: string | null;
}

export interface BrandColors {
  primary: string;
  accent: string;
  neutral_dark: string;
  neutral_light: string;
}

export interface Geo {
  lat: number;
  lng: number;
}

export type WebsiteStatus = "none" | "stale" | "has_site";

export interface CanonicalRecord {
  source_id: string;
  scraped_at?: string;
  confidence?: number;
  business_name: string;
  legal_name?: string;
  industry_raw?: string;
  industry_slug: string;
  address: Address;
  phone: string;
  email?: string;
  website?: string;
  website_status?: WebsiteStatus;
  hours?: HoursEntry[];
  geo?: Geo;
  services?: ServiceItem[];
  logo?: LogoAsset;
  brand_colors?: BrandColors;
  photos?: PhotoAsset[];
  description?: string;
  socials?: { facebook?: string; instagram?: string };
  sources?: string[];
}

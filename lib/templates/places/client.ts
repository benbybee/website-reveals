import type { SupabaseClient } from "@supabase/supabase-js";
import type { HoursEntry, Weekday } from "../types";
import { toE164 } from "../normalize/phone";
import { GOOGLE_PLACES_API_KEY, googlePlacesEnabled } from "../config";

// Thin REST client for the Google Places API (New) — Autocomplete + Place
// Details — for the rep instant-preview GBP picker. Deterministic, no LLM.
// Endpoints/field masks are documented so a live-test shape surprise is a quick
// fix; extraction is defensive (optional chaining) so partial responses degrade
// rather than throw.
const BASE = "https://places.googleapis.com/v1";

// Place Details (New) with opening-hours + website fields is an "Enterprise" SKU
// (~$0.017/call). Mirrored by budget.ts' estimate. Autocomplete is billed
// separately/cheaper and is not ledgered here (it fires per keystroke).
const PLACES_DETAILS_USD = 0.017;

const DETAILS_FIELD_MASK = [
  "id",
  "displayName",
  "formattedAddress",
  "addressComponents",
  "internationalPhoneNumber",
  "nationalPhoneNumber",
  "websiteUri",
  "regularOpeningHours",
  "types",
  "location",
  "photos",
].join(",");

/** Thrown when a Places call is attempted without GOOGLE_PLACES_API_KEY. */
export class PlacesDisabledError extends Error {
  constructor() {
    super("Google Places API is not configured (GOOGLE_PLACES_API_KEY unset)");
    this.name = "PlacesDisabledError";
  }
}

export interface AutocompleteMatch {
  placeId: string;
  description: string;
}

interface RawAutocomplete {
  suggestions?: Array<{ placePrediction?: { placeId?: string; text?: { text?: string } } }>;
}

/** Live typeahead: POST places:autocomplete → [{ placeId, description }]. */
export async function placesAutocomplete(input: string): Promise<AutocompleteMatch[]> {
  if (!googlePlacesEnabled()) throw new PlacesDisabledError();
  const res = await fetch(`${BASE}/places:autocomplete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY(),
    },
    body: JSON.stringify({ input }),
  });
  if (!res.ok) throw new Error(`places autocomplete failed: ${res.status}`);
  const json = (await res.json()) as RawAutocomplete;
  return (json.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is { placeId: string; text?: { text?: string } } => Boolean(p?.placeId))
    .map((p) => ({ placeId: p.placeId, description: p.text?.text ?? "" }));
}

export interface PlaceAddress {
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

export interface PlaceDetails {
  placeId: string;
  name: string;
  website?: string;
  phone?: string;
  address: PlaceAddress;
  hours?: HoursEntry[];
  categories: string[];
  photoRefs: string[];
  geo?: { lat: number; lng: number };
}

interface RawAddrComp {
  longText?: string;
  shortText?: string;
  types?: string[];
}
interface RawTimePoint {
  day?: number;
  hour?: number;
  minute?: number;
}
interface RawPlace {
  id?: string;
  displayName?: { text?: string };
  addressComponents?: RawAddrComp[];
  internationalPhoneNumber?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  regularOpeningHours?: { periods?: Array<{ open?: RawTimePoint; close?: RawTimePoint }> };
  types?: string[];
  location?: { latitude?: number; longitude?: number };
  photos?: Array<{ name?: string }>;
}

// Places API (New) numbers days 0=Sunday … 6=Saturday.
const DAY_BY_NUM: Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function hm(h?: number, m?: number): string {
  return `${String(h ?? 0).padStart(2, "0")}:${String(m ?? 0).padStart(2, "0")}`;
}

function mapHours(roh?: RawPlace["regularOpeningHours"]): HoursEntry[] | undefined {
  const periods = roh?.periods;
  if (!periods?.length) return undefined;
  const out: HoursEntry[] = [];
  for (const p of periods) {
    if (p.open?.day == null) continue;
    const day = DAY_BY_NUM[p.open.day];
    if (!day) continue;
    // A period with an open but no close is Places' "open 24 hours" convention.
    if (!p.close) {
      out.push({ day, open: "00:00", close: "23:59" });
      continue;
    }
    out.push({ day, open: hm(p.open.hour, p.open.minute), close: hm(p.close.hour, p.close.minute) });
  }
  return out.length ? out : undefined;
}

function parseAddress(components?: RawAddrComp[]): PlaceAddress {
  const get = (type: string, useShort = false): string => {
    const c = (components ?? []).find((x) => x.types?.includes(type));
    return (useShort ? c?.shortText : c?.longText) ?? "";
  };
  const street = [get("street_number"), get("route")].filter(Boolean).join(" ");
  const city = get("locality") || get("postal_town") || get("sublocality") || "";
  return {
    street,
    city,
    state: get("administrative_area_level_1", true),
    zip: get("postal_code"),
    country: get("country", true) || "US",
  };
}

export interface PlaceDetailsOptions {
  /** When db + campaignId are given, ledger the Places details spend (gap 5). */
  db?: SupabaseClient;
  campaignId?: string;
  repId?: string;
}

/** GET a place's details, normalized to our shape. Ledgers cost when asked. */
export async function placeDetails(
  placeId: string,
  opts: PlaceDetailsOptions = {},
): Promise<PlaceDetails> {
  if (!googlePlacesEnabled()) throw new PlacesDisabledError();
  const res = await fetch(`${BASE}/places/${encodeURIComponent(placeId)}`, {
    headers: {
      "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY(),
      "X-Goog-FieldMask": DETAILS_FIELD_MASK,
    },
  });
  if (!res.ok) throw new Error(`place details failed: ${res.status}`);
  const p = (await res.json()) as RawPlace;

  // Ledger spend best-effort — bookkeeping must never fail the lookup.
  if (opts.db && opts.campaignId) {
    try {
      await opts.db.from("tpl_cost_events").insert({
        campaign_id: opts.campaignId,
        stage: "find",
        actor: "google-places",
        units: 1,
        usd: PLACES_DETAILS_USD,
        rep_id: opts.repId ?? null,
        run_id: null,
      });
    } catch {
      /* ignore */
    }
  }

  return normalizePlaceDetails(p, placeId);
}

// Places Photo (New) SKU (~$0.007/photo). Resolves a photo reference to a usable
// image URL. skipHttpRedirect=true returns JSON { photoUri } instead of a 302 to
// the image, so we can store the URL for the brief. Real business photography —
// the robust real-photo source for JS-rendered sites the deterministic site
// parse can't read.
export async function resolvePlacePhotoUrl(
  photoName: string,
  maxWidthPx = 1200,
): Promise<string | null> {
  if (!googlePlacesEnabled()) throw new PlacesDisabledError();
  // photoName is "places/{id}/photos/{ref}" — its slashes are path segments.
  const url = `${BASE}/${photoName}/media?maxWidthPx=${maxWidthPx}&skipHttpRedirect=true`;
  const res = await fetch(url, { headers: { "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY() } });
  if (!res.ok) return null;
  const json = (await res.json()) as { photoUri?: string };
  return json.photoUri ?? null;
}

function normalizePlaceDetails(p: RawPlace, placeId: string): PlaceDetails {
  return {
    placeId: p.id ?? placeId,
    name: p.displayName?.text ?? "",
    website: p.websiteUri || undefined,
    phone: toE164(p.internationalPhoneNumber ?? p.nationalPhoneNumber) ?? undefined,
    address: parseAddress(p.addressComponents),
    hours: mapHours(p.regularOpeningHours),
    categories: p.types ?? [],
    photoRefs: (p.photos ?? []).map((ph) => ph.name).filter((n): n is string => Boolean(n)),
    geo:
      typeof p.location?.latitude === "number" && typeof p.location?.longitude === "number"
        ? { lat: p.location.latitude, lng: p.location.longitude }
        : undefined,
  };
}

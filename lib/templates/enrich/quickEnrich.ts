import type { SupabaseClient } from "@supabase/supabase-js";
import type { BrandColors, CanonicalRecord, LogoAsset, PhotoAsset } from "../types";
import { assembleRecord, verifyAndScore } from "./index";
import type { AssembleOutput } from "./index";
import { extractSiteAssets } from "./ogImages";
import { hexesFromHtml } from "./palette";
import { brandColorsFromPalette } from "./colors";
import { defaultServices } from "../industries/defaultServices";
import { resolvePlacePhotoUrl } from "../places/client";
import { scrapeBrandDNA } from "../../firecrawl";
import {
  firecrawlEnabled,
  googlePlacesEnabled,
  FIRECRAWL_USD_PER_CREDIT,
  FIRECRAWL_CREDITS_PER_SCRAPE,
} from "../config";

const TARGET_PHOTOS = 6;
// Places Photo (New) SKU (~$0.007/photo). Mirrors the client rate; used only to
// ledger the small spend when Places photos fill the gap.
const PLACES_PHOTO_USD = 0.007;

// Deterministic-first, LLM-minimal enrichment for the rep instant-preview flow
// (gap 2). Places fields + homepage HTML parse (logo/photos/palette) + per-
// industry default services + a mailto:/Places email. The cheap Firecrawl
// branding scrape runs ONLY when the deterministic logo AND colors both come up
// empty (~10-20% of sites). Every merged asset is HEAD-verified (gap 3, via the
// shared verifyAndScore seam). Zero LLM on the WR side.

export interface QuickEnrichInput {
  /** Partial record from mapPlaceDetails (Places fields; no industry_slug). */
  place: Partial<CanonicalRecord>;
  /** SL sl_slug of the industry the rep picked — stamped as industry_slug. */
  industrySlug: string;
  /** Fetched homepage HTML (may be empty / absent for a no-site prospect). */
  html?: string;
  /** Google Places photo references (real business photography) — resolved to
   *  fill the gap when the site parse yields too few photos (robust to SPAs). */
  photoRefs?: string[];
  /** For the best-effort Firecrawl / Places-photo cost ledger (gap 5). */
  db?: SupabaseClient;
  campaignId?: string;
  repId?: string;
}

const MAILTO = /mailto:([^"'?>\s]+@[^"'?>\s]+)/i;

/** First `mailto:` address in the page HTML, if any. */
function firstMailto(html?: string): string | undefined {
  if (!html) return undefined;
  const m = html.match(MAILTO);
  return m ? m[1].trim() : undefined;
}

export async function quickEnrich(input: QuickEnrichInput): Promise<AssembleOutput> {
  const { place, industrySlug, html, photoRefs, db, campaignId, repId } = input;
  const baseUrl = place.website;

  // 1. Deterministic site assets (logo + photos) + palette from HTML.
  const assets = html && baseUrl ? extractSiteAssets(html, baseUrl) : { photos: [] };
  const hexes = html ? hexesFromHtml(html) : [];
  let detLogo: LogoAsset | undefined = assets.logoUrl ? { src_url: assets.logoUrl } : undefined;
  let detColors: BrandColors | undefined = brandColorsFromPalette(hexes) ?? undefined;

  // 2. Deterministic email: a site mailto: beats the Places-supplied email.
  const email = firstMailto(html) ?? place.email;

  // 3. Photos: real site photos first, then real Google Places business photos to
  //    fill the gap to TARGET (cost-efficient — none resolved when the site
  //    already yields enough; robust to JS-rendered sites the parse can't read).
  const siteUrls = assets.photos;
  const placeUrls: string[] = [];
  const need = TARGET_PHOTOS - siteUrls.length;
  if (need > 0 && photoRefs?.length && googlePlacesEnabled()) {
    for (const ref of photoRefs.slice(0, need)) {
      try {
        const u = await resolvePlacePhotoUrl(ref, 1600);
        if (u) placeUrls.push(u);
      } catch {
        /* best-effort — a failed photo resolve never blocks the build */
      }
    }
  }
  const photos: PhotoAsset[] = [];
  const seenPhoto = new Set<string>();
  for (const src of [...siteUrls, ...placeUrls]) {
    if (seenPhoto.has(src)) continue;
    seenPhoto.add(src);
    photos.push({ slot: photos.length === 0 ? "hero" : `gallery-${photos.length}`, src_url: src });
    if (photos.length >= TARGET_PHOTOS) break;
  }

  // 4. Firecrawl branding ONLY on a deterministic miss (logo AND colors empty).
  let firecrawlCredits = 0;
  if (!detLogo && !detColors && firecrawlEnabled() && baseUrl) {
    try {
      const dna = await scrapeBrandDNA(baseUrl);
      firecrawlCredits += dna.creditsUsed ?? FIRECRAWL_CREDITS_PER_SCRAPE;
      if (dna.logoUrl) detLogo = { src_url: dna.logoUrl };
      if (dna.primaryColor) {
        const c = dna.colors ?? {};
        detColors = {
          primary: dna.primaryColor,
          accent: c.accent || c.secondary || undefined,
          neutral_dark: c.textPrimary || undefined,
          neutral_light: c.background || undefined,
        };
      }
    } catch {
      /* best-effort — a failed branding scrape never blocks the build */
    }
  }

  // 5. Merge + score, then patch thin services with per-industry defaults.
  const placePlus: Partial<CanonicalRecord> = { ...place };
  if (email) placePlus.email = email;
  if (photos.length) placePlus.photos = photos;
  const gbpCategories = place.industry_raw ? [place.industry_raw] : [];

  const { record } = assembleRecord({
    place: placePlus,
    gbpCategories,
    palette: hexes,
    logo: detLogo,
    brandColors: detColors,
    industrySlug,
  });
  if ((record.services?.length ?? 0) < 3) {
    const defaults = defaultServices(industrySlug);
    if (defaults.length) record.services = defaults;
  }

  // Accurate provenance: assembleRecord tags "firecrawl" whenever logo/colors are
  // passed, but here they may be deterministic. Reflect what actually ran.
  const srcs = new Set(record.sources ?? []);
  srcs.delete("firecrawl");
  if (html && (assets.logoUrl || hexes.length || siteUrls.length)) srcs.add("site-parse");
  if (firecrawlCredits > 0) srcs.add("firecrawl");
  if (placeUrls.length) srcs.add("google-places-photo");
  record.sources = [...srcs];

  // 6. Ledger Firecrawl spend best-effort (bookkeeping never fails the build).
  if (firecrawlCredits > 0 && db && campaignId) {
    try {
      await db.from("tpl_cost_events").insert({
        campaign_id: campaignId,
        stage: "enrich",
        actor: "firecrawl",
        units: firecrawlCredits,
        usd: firecrawlCredits * FIRECRAWL_USD_PER_CREDIT(),
        rep_id: repId ?? null,
        run_id: null,
      });
    } catch {
      /* ignore */
    }
  }

  // 6b. Ledger the small Places-photo spend, best-effort.
  if (placeUrls.length > 0 && db && campaignId) {
    try {
      await db.from("tpl_cost_events").insert({
        campaign_id: campaignId,
        stage: "find",
        actor: "google-places-photo",
        units: placeUrls.length,
        usd: placeUrls.length * PLACES_PHOTO_USD,
        rep_id: repId ?? null,
        run_id: null,
      });
    } catch {
      /* ignore */
    }
  }

  // 7. HEAD-verify the merged assets + re-score on what survives (gap 3).
  return verifyAndScore(record);
}

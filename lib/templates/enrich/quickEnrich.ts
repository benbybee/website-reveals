import type { SupabaseClient } from "@supabase/supabase-js";
import type { BrandColors, CanonicalRecord, LogoAsset, PhotoAsset } from "../types";
import { assembleRecord, verifyAndScore } from "./index";
import type { AssembleOutput } from "./index";
import { extractSiteAssets } from "./ogImages";
import { hexesFromHtml } from "./palette";
import { brandColorsFromPalette } from "./colors";
import { defaultServices } from "../industries/defaultServices";
import { scrapeBrandDNA } from "../../firecrawl";
import {
  firecrawlEnabled,
  FIRECRAWL_USD_PER_CREDIT,
  FIRECRAWL_CREDITS_PER_SCRAPE,
} from "../config";

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
  /** For the best-effort Firecrawl cost ledger (gap 5). */
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
  const { place, industrySlug, html, db, campaignId, repId } = input;
  const baseUrl = place.website;

  // 1. Deterministic site assets (logo + photos) + palette from HTML.
  const assets = html && baseUrl ? extractSiteAssets(html, baseUrl) : { photos: [] };
  const hexes = html ? hexesFromHtml(html) : [];
  let detLogo: LogoAsset | undefined = assets.logoUrl ? { src_url: assets.logoUrl } : undefined;
  let detColors: BrandColors | undefined = brandColorsFromPalette(hexes) ?? undefined;

  // 2. Deterministic email: a site mailto: beats the Places-supplied email.
  const email = firstMailto(html) ?? place.email;

  // 3. Photos → hero-first PhotoAsset[].
  const photos: PhotoAsset[] = assets.photos.map((src, i) => ({
    slot: i === 0 ? "hero" : `gallery-${i}`,
    src_url: src,
  }));

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
  if (html && (assets.logoUrl || hexes.length || photos.length)) srcs.add("site-parse");
  if (firecrawlCredits > 0) srcs.add("firecrawl");
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

  // 7. HEAD-verify the merged assets + re-score on what survives (gap 3).
  return verifyAndScore(record);
}

import type { CanonicalRecord, PhotoAsset } from "../types";

// apify/facebook-pages-scraper item. Page-data fields are intentionally loose:
// the scraper returns an error shape ({url, error, errorDescription}) without
// auth cookies, which is the common runtime case. We only consume the fields we
// can verify; everything else is best-effort gap-filling.
export interface FacebookItem {
  url?: string;
  error?: string;
  errorDescription?: string;
  profilePictureUrl?: string;
  profilePhoto?: string;
  coverPhotoUrl?: string;
  pageUrl?: string;
  facebookUrl?: string;
  about?: string;
  info?: string[];
}

/** True when the scraper returned an error instead of page data. */
export function isFacebookError(item: FacebookItem | null | undefined): boolean {
  return !!item?.error || (!item?.profilePictureUrl && !item?.coverPhotoUrl && !item?.about);
}

/**
 * Map a Facebook page item → partial enrichment (logo, cover photo, description,
 * social link). Returns {} on the error shape so the orchestrator can merge
 * best-effort without overwriting anything. Page-data field extraction beyond
 * these stays minimal until a cookie-authed FB capture is available.
 */
export function mapFacebookToRecord(item: FacebookItem | null | undefined): Partial<CanonicalRecord> {
  if (!item || isFacebookError(item)) return {};

  const rec: Partial<CanonicalRecord> = {};
  const logoUrl = item.profilePictureUrl || item.profilePhoto;
  if (logoUrl) rec.logo = { src_url: logoUrl };

  if (item.coverPhotoUrl) {
    const cover: PhotoAsset = { slot: "about", src_url: item.coverPhotoUrl };
    rec.photos = [cover];
  }

  if (item.about) rec.description = item.about;

  const fbUrl = item.facebookUrl || item.pageUrl || item.url;
  if (fbUrl) rec.socials = { facebook: fbUrl };

  return rec;
}

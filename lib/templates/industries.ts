// Template Site industry taxonomy (tpl_industries). One row per service
// industry: `slug` is the stable join key the discover task matches a campaign's
// industry_slug against; `google_categories` are the Google Maps search terms
// discovery scrapes; `sl_slug` is the industry key SL's template library matches
// on at build time. Campaigns pick an industry from this table (dropdown), so
// every campaign in an industry shares one canonical slug.

export interface TplIndustry {
  id: string;
  slug: string;
  display_name: string;
  google_categories: string[];
  sl_slug: string;
  created_at: string;
}

// Normalize a display name into the canonical kebab-case slug. Lowercase, strip
// accents, collapse any non-alphanumeric run to a single hyphen, trim hyphens.
// Used both server-side (create) and client-side (live preview) so the two agree.
export function slugifyIndustry(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

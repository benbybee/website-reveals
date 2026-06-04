// Kura project slug — the URL-safe identifier SL/Kura key the conversion on.
// Must satisfy SL's conversion contract regex exactly: lowercase alphanumerics
// and single hyphens, 1–60 chars, no leading/trailing hyphen.
// Source: PIPELINE-COORDINATION.md §7 [SL] 2026-06-03 — kura_input.slug.
export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/;

const MAX_SLUG_LEN = 60;

export function isValidSlug(s: unknown): s is string {
  return typeof s === "string" && SLUG_RE.test(s);
}

/**
 * Best-effort slug suggestion from a business name. Lowercases, strips
 * accents, collapses any run of non-alphanumerics to a single hyphen, trims
 * leading/trailing hyphens, and caps length so the result satisfies SLUG_RE.
 * Returns "" when no usable characters remain (caller must require a manual slug).
 */
export function slugify(input: string): string {
  const ascii = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, ""); // drop combining diacritics
  const collapsed = ascii
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!collapsed) return "";
  // Cap to MAX_SLUG_LEN, then re-trim a trailing hyphen the cut may have left.
  return collapsed.slice(0, MAX_SLUG_LEN).replace(/-+$/g, "");
}

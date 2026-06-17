// Keyword list-cleaning: parse a free-form, comma-separated keyword input and
// build a case-insensitive "business_name contains ANY keyword" filter for
// PostgREST's .or(). Pure + testable so the matching can't silently drift.

const MAX_KEYWORDS = 50;

/**
 * Parse comma-separated keywords into clean tokens. Strips characters that are
 * structural in PostgREST's .or() syntax or are ilike wildcards (so each token
 * matches literally as a substring), collapses whitespace, drops empties, caps
 * the count. Accepts a raw string or an already-split array.
 */
export function parseKeywords(input: string | string[] | undefined | null): string[] {
  const raw = Array.isArray(input) ? input.join(",") : (input ?? "");
  return raw
    .split(",")
    .map((k) => k.replace(/[,()*\\%_]/g, " ").replace(/\s+/g, " ").trim())
    .filter((k) => k.length > 0)
    .slice(0, MAX_KEYWORDS);
}

/**
 * Build the PostgREST .or() argument: business_name ILIKE *kw* for each keyword,
 * OR'd together. The wildcard inside .or() is `*` (not `%`). Returns "" when
 * there are no keywords — callers must treat that as "no match / reject".
 */
export function buildNameOrFilter(keywords: string[]): string {
  return keywords.map((k) => `business_name.ilike.*${k}*`).join(",");
}

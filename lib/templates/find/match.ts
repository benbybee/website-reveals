// Pure, DB-free input normalizers for the /join lookup. The matching itself
// lives in SQL: tpl_search_prospects for the name typeahead, and an exact zip
// compare in the confirm route.

/** First 5 digits, or "" if the input isn't a clean 5-digit US ZIP. */
export function normalizeZip(raw: string): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits.length >= 5 ? digits.slice(0, 5) : "";
}

/** Trimmed, single-spaced search/business name. */
export function normalizeName(raw: string): string {
  return (raw ?? "").trim().replace(/\s+/g, " ");
}

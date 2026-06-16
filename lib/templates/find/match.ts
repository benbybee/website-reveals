// Pure, DB-free helpers for the /join lookup. The fuzzy SQL lives in
// tpl_find_prospects; here we only normalize inputs and shape the result.

export interface FindRow {
  id: string;
  business_name: string | null;
  city: string | null;
  state: string | null;
  preview_url: string | null;
  sim: number;
}

export type MatchResult =
  | { kind: "none" }
  | { kind: "one"; match: FindRow }
  | { kind: "many"; matches: FindRow[] };

/** First 5 digits, or "" if the input isn't a clean 5-digit US ZIP. */
export function normalizeZip(raw: string): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits.length >= 5 ? digits.slice(0, 5) : "";
}

/** Trimmed, single-spaced business name. */
export function normalizeName(raw: string): string {
  return (raw ?? "").trim().replace(/\s+/g, " ");
}

/** none / one / many from the search rows (already zip+name filtered by SQL). */
export function classifyMatches(rows: FindRow[]): MatchResult {
  if (rows.length === 0) return { kind: "none" };
  if (rows.length === 1) return { kind: "one", match: rows[0] };
  return { kind: "many", matches: rows };
}

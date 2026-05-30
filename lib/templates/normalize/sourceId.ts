/**
 * Build the stable dedupe key from a Google place_id. Throws if empty — the
 * dedupe key must always be present and stable (upsert anchor for re-scrapes).
 */
export function sourceId(placeId: string): string {
  const trimmed = (placeId ?? "").trim();
  if (!trimmed) throw new Error("sourceId requires a non-empty place_id");
  return `wr-tpl-${trimmed}`;
}

// Shared prospect filtering for the campaign CRM list and its CSV export. Both
// routes MUST apply identical filters ("export what you're looking at"), so the
// translation from query params to PostgREST filters lives here, once.
//
// All paths read the canonical `record` JSONB (source of truth) rather than the
// promoted columns: street/zip exist only on the record, and mixing sources
// would let the list and the CSV disagree.

/** Structural slice of PostgrestFilterBuilder we use — keeps this lib testable. */
export interface ProspectFilterable<Q> {
  eq(column: string, value: string): Q;
  neq(column: string, value: string): Q;
  or(filters: string): Q;
  contains(column: string, value: Record<string, unknown>): Q;
}

const DNA_PATHS = ["record->logo->>src_url", "record->brand_colors->>primary"] as const;

// A "mailable" address needs all four parts — zip included, because the whole
// point of the clean-list export is handing it to a mail house.
const ADDRESS_PATHS = [
  "record->address->>street",
  "record->address->>city",
  "record->address->>state",
  "record->address->>zip",
] as const;

// `neq ''` excludes both SQL NULL (a NULL ->> comparison is never true) and the
// empty strings the discover mapper writes for unknown address parts.
// "missing" is the complement: any part null or empty.
function missingOrClause(paths: readonly string[]): string {
  return paths.map((p) => `${p}.is.null,${p}.eq.""`).join(",");
}

export const DNA_MISSING_OR = missingOrClause(DNA_PATHS);
export const ADDRESS_MISSING_OR = missingOrClause(ADDRESS_PATHS);

/**
 * Apply the shared list/export filters from query params:
 * - stage, website_status, agent: column equality
 * - missing: completeness.missing array containment (score-time view)
 * - dna=has|missing: logo src AND primary color present / either absent (live view)
 * - address=has|missing: street+city+state+zip all present / any absent (live view)
 * Unknown values are ignored rather than erroring — a stale UI can't 500 the list.
 */
export function applyProspectFilters<Q extends ProspectFilterable<Q>>(
  query: Q,
  sp: URLSearchParams,
): Q {
  const stage = sp.get("stage");
  if (stage) query = query.eq("stage", stage);

  const websiteStatus = sp.get("website_status");
  if (websiteStatus) query = query.eq("website_status", websiteStatus);

  const agent = sp.get("agent");
  if (agent) query = query.eq("agent_id", agent);

  const missing = sp.get("missing");
  if (missing) query = query.contains("completeness", { missing: [missing] });

  const dna = sp.get("dna");
  if (dna === "has") for (const p of DNA_PATHS) query = query.neq(p, "");
  else if (dna === "missing") query = query.or(DNA_MISSING_OR);

  const address = sp.get("address");
  if (address === "has") for (const p of ADDRESS_PATHS) query = query.neq(p, "");
  else if (address === "missing") query = query.or(ADDRESS_MISSING_OR);

  // site=has|missing — whether a speculative site (preview_url) has been
  // generated. preview_url is the promoted column (set by the SL callback /
  // reconcile); it's never "", so neq "" == "has a generated URL".
  const site = sp.get("site");
  if (site === "has") query = query.neq("preview_url", "");
  else if (site === "missing") query = query.or('preview_url.is.null,preview_url.eq.""');

  // exported=yes|no — whether the lead has been included in a CSV export
  // (exported_at stamped). Lets the operator hand only the not-yet-exported
  // batch to Click2Mail.
  const exported = sp.get("exported");
  if (exported === "yes") query = query.or("exported_at.not.is.null");
  else if (exported === "no") query = query.or("exported_at.is.null");

  // suppressed — list cleaning. Suppressed leads (suppressed_at stamped) are
  // moved to the cross-campaign Suppressed list and removed from the working
  // CRM list AND the CSV export BY DEFAULT (the campaign list should only hold
  // people we intend to mail). `suppressed=only` surfaces just them;
  // `suppressed=all` shows both. Expressed via or() to stay within the
  // ProspectFilterable interface (no is/not methods, see the test mock).
  const suppressed = sp.get("suppressed");
  if (suppressed === "only") query = query.or("suppressed_at.not.is.null");
  else if (suppressed !== "all") query = query.or("suppressed_at.is.null");

  return query;
}

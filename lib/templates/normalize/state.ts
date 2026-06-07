const FULL_TO_ABBR: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", "district of columbia": "DC",
  florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL",
  indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA",
  maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN",
  mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK",
  oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
  virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI",
  wyoming: "WY",
};

const VALID_ABBR = new Set(Object.values(FULL_TO_ABBR));
const ABBR_TO_FULL: Record<string, string> = Object.fromEntries(
  Object.entries(FULL_TO_ABBR).map(([full, abbr]) => [abbr, full]),
);

export function toStateAbbr(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const upper = trimmed.toUpperCase();
  if (trimmed.length === 2 && VALID_ABBR.has(upper)) return upper;
  return FULL_TO_ABBR[trimmed.toLowerCase()] ?? null;
}

/** Title-cased full US state name for an abbreviation or full name, else null. */
export function toStateName(raw: string | null | undefined): string | null {
  const abbr = toStateAbbr(raw);
  if (!abbr) return null;
  const full = ABBR_TO_FULL[abbr];
  return full ? full.replace(/\b\w/g, (c) => c.toUpperCase()) : null;
}

/** All US states + DC as { abbr, name }, sorted by name — for select inputs. */
export const US_STATES: { abbr: string; name: string }[] = Object.entries(FULL_TO_ABBR)
  .map(([full, abbr]) => ({ abbr, name: full.replace(/\b\w/g, (c) => c.toUpperCase()) }))
  .sort((a, b) => a.name.localeCompare(b.name));

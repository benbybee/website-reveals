import { NextRequest, NextResponse } from "next/server";
import { requireSalesRepAuth } from "@/lib/sales-rep-auth";
import { templatesEnabled, googlePlacesEnabled } from "@/lib/templates/config";
import { placesAutocomplete, PlacesDisabledError } from "@/lib/templates/places/client";

export const dynamic = "force-dynamic";

/**
 * Rep instant-preview — Google Business Profile business search.
 * POST { query, industrySlug? } → Google Places Autocomplete → [{ placeId, description }].
 *
 * AUTHN: verified server-side rep session (requireSalesRepAuth). AUTHZ: this
 * route reads no owned record — it only runs a Places search — so there is no
 * per-record ownership check here (the /confirm route, which writes a prospect,
 * scopes it to the rep's own campaign). Autocomplete is a billed Places SKU, so
 * it is authenticated AND lightly rate-limited per rep to cap runaway spend; the
 * client also debounces. (Future: Places session tokens to bundle autocomplete +
 * details into one billing session.)
 */
const HITS = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 40; // a debounced typeahead session ≈ a handful of calls

function rateLimited(key: string): boolean {
  const now = Date.now();
  if (HITS.size > 512) {
    for (const [k, v] of HITS) if (now > v.resetAt) HITS.delete(k);
  }
  const e = HITS.get(key);
  if (!e || now > e.resetAt) {
    HITS.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  e.count += 1;
  return e.count > MAX_PER_WINDOW;
}

export async function POST(req: NextRequest) {
  if (!templatesEnabled()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const auth = await requireSalesRepAuth();
  if (auth.error) return auth.error;

  if (!googlePlacesEnabled()) {
    return NextResponse.json({ error: "places_unconfigured" }, { status: 503 });
  }
  if (rateLimited(auth.session.rep_id)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let body: { query?: string; industrySlug?: string };
  try {
    body = (await req.json()) as { query?: string; industrySlug?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const query = (body.query ?? "").trim();
  // Require 2+ chars so a single keystroke can't fire a billed search.
  if (query.length < 2) {
    return NextResponse.json({ matches: [] });
  }

  try {
    const matches = await placesAutocomplete(query);
    return NextResponse.json({ matches });
  } catch (e) {
    if (e instanceof PlacesDisabledError) {
      return NextResponse.json({ error: "places_unconfigured" }, { status: 503 });
    }
    console.error("[templates:find/gbp] autocomplete failed:", e);
    return NextResponse.json({ error: "search_failed" }, { status: 502 });
  }
}

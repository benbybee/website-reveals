import { NextRequest, NextResponse, after } from "next/server";
import { tplDb } from "@/lib/templates/db";
import { templatesEnabled } from "@/lib/templates/config";
import { normalizeName } from "@/lib/templates/find/match";

export const dynamic = "force-dynamic";

// Name-only typeahead for the /join landing page. Fires as the visitor types, so
// it's debounced client-side and rate-limited here. Returns id + name + location
// only — NOT preview_url; the site link stays behind the ZIP-confirm step
// (/api/templates/find/confirm). Best-effort in-memory per-IP limit; the Map
// self-prunes so it can't grow unbounded on a warm instance.
const HITS = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 60; // generous: one keystroke-driven search ≈ a few calls

function rateLimited(ip: string): boolean {
  const now = Date.now();
  if (HITS.size > 512) {
    for (const [key, val] of HITS) {
      if (now > val.resetAt) HITS.delete(key);
    }
  }
  const e = HITS.get(ip);
  if (!e || now > e.resetAt) {
    HITS.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  e.count += 1;
  return e.count > MAX_PER_WINDOW;
}

interface Suggestion {
  id: string;
  business_name: string | null;
  city: string | null;
  state: string | null;
}

export async function POST(req: NextRequest) {
  if (!templatesEnabled()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let body: { business_name?: string };
  try {
    body = (await req.json()) as { business_name?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const name = normalizeName(body.business_name ?? "");
  // Require 2+ chars so a single keystroke can't enumerate the whole list.
  if (name.length < 2) {
    return NextResponse.json({ suggestions: [] });
  }

  const db = tplDb();
  const { data, error } = await db.rpc("tpl_search_prospects", { p_name: name });
  if (error) {
    return NextResponse.json({ error: "search_failed" }, { status: 500 });
  }

  const suggestions: Suggestion[] = ((data ?? []) as Suggestion[]).map((s) => ({
    id: s.id,
    business_name: s.business_name,
    city: s.city,
    state: s.state,
  }));

  // Funnel: record the search (what they typed + how many matched) AFTER the
  // response so it never slows the search. Best-effort — logging must not break.
  const ua = req.headers.get("user-agent");
  after(async () => {
    try {
      await db.from("tpl_join_events").insert({
        kind: "search",
        query: name.slice(0, 120),
        result_count: suggestions.length,
        ip: ip === "unknown" ? null : ip,
        user_agent: ua,
      });
    } catch {
      /* ignore */
    }
  });

  return NextResponse.json({ suggestions });
}

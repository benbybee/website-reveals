import { NextRequest, NextResponse } from "next/server";
import { requireSalesRepAuth } from "@/lib/sales-rep-auth";
import { templatesEnabled, googlePlacesEnabled } from "@/lib/templates/config";
import { tplDb } from "@/lib/templates/db";
import { runInstantPreview } from "@/lib/templates/rep/instantPreview";
import { PlacesDisabledError } from "@/lib/templates/places/client";

// A single build can dry-run + POST to SL inline; keep headroom over the 60s
// default for the enrich + push round-trip.
export const maxDuration = 120;
export const dynamic = "force-dynamic";

/**
 * Rep instant-preview — confirm a picked GBP + build a speculative preview.
 * POST { placeId, industrySlug } → runInstantPreview (coverage + budget guards,
 * Places details, deterministic quick-enrich, single push to SL). The prospect
 * is written into the rep's OWN sales campaign, scoped by the server session's
 * rep_id (never a client-supplied id). Over-budget → 402; not-ready → 400.
 */

// Best-effort homepage fetch feeding the deterministic enricher. The URL comes
// from Google Places (a public business site), GET only, http(s) only, timed
// out and size-capped — a bounded SSRF surface, not attacker-supplied.
async function fetchHomepage(url: string): Promise<string | null> {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
      headers: { "user-agent": "Mozilla/5.0 (WebsiteReveals RepPreview)" },
    });
    if (!res.ok) return null;
    if (!(res.headers.get("content-type") ?? "").includes("text/html")) return null;
    return (await res.text()).slice(0, 600_000);
  } catch {
    return null;
  }
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

  let body: { placeId?: string; industrySlug?: string };
  try {
    body = (await req.json()) as { placeId?: string; industrySlug?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const placeId = (body.placeId ?? "").trim();
  const industrySlug = (body.industrySlug ?? "").trim();
  if (!placeId || !industrySlug) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  try {
    const result = await runInstantPreview({
      db: tplDb(),
      rep: { rep_id: auth.session.rep_id, email: auth.session.email },
      placeId,
      industrySlug,
      fetchHtml: fetchHomepage,
    });

    if (!result.ok) {
      if (result.code === "over_budget") {
        return NextResponse.json({ error: "over_budget", cap: result.cap }, { status: 402 });
      }
      return NextResponse.json({ error: "template_not_ready" }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      prospectId: result.prospectId,
      batchId: result.batchId,
      recordCount: result.recordCount,
    });
  } catch (e) {
    if (e instanceof PlacesDisabledError) {
      return NextResponse.json({ error: "places_unconfigured" }, { status: 503 });
    }
    console.error("[templates:find/gbp/confirm] build failed:", e);
    return NextResponse.json({ error: "build_failed" }, { status: 500 });
  }
}

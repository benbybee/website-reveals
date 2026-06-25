import { NextRequest, NextResponse } from "next/server";
import { tplDb } from "@/lib/templates/db";
import { templatesEnabled } from "@/lib/templates/config";

export const dynamic = "force-dynamic";

// Top-of-funnel beacon: the /join page fires this once on load so we can count
// raw arrivals (people who scanned the QR and reached the page) separately from
// the later steps. Public + unauthenticated by design; lightly rate-limited so a
// single client can't inflate the count. Best-effort — never blocks the page.
const HITS = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;

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

export async function POST(req: NextRequest) {
  if (!templatesEnabled()) return NextResponse.json({ ok: false }, { status: 404 });
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (rateLimited(ip)) return new NextResponse(null, { status: 204 });

  try {
    await tplDb().from("tpl_join_events").insert({
      kind: "visit",
      ip: ip === "unknown" ? null : ip,
      user_agent: req.headers.get("user-agent"),
    });
  } catch {
    /* best-effort */
  }
  return new NextResponse(null, { status: 204 });
}

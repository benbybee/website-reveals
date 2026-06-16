import { NextRequest, NextResponse } from "next/server";
import { tplDb } from "@/lib/templates/db";
import { templatesEnabled } from "@/lib/templates/config";
import { normalizeName, normalizeZip, classifyMatches, type FindRow } from "@/lib/templates/find/match";

export const dynamic = "force-dynamic";

// Best-effort in-memory per-IP limit (mirrors app/api/form/start). Public,
// DB-touching endpoint hygiene — not a privacy control.
const HITS = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const e = HITS.get(ip);
  if (!e || now > e.resetAt) {
    HITS.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  e.count += 1;
  return e.count > MAX_PER_WINDOW;
}

export async function POST(req: NextRequest) {
  if (!templatesEnabled()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let body: { business_name?: string; zip?: string };
  try {
    body = (await req.json()) as { business_name?: string; zip?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const name = normalizeName(body.business_name ?? "");
  const zip = normalizeZip(body.zip ?? "");
  if (!name || !zip) {
    return NextResponse.json({ result: "none" });
  }

  const db = tplDb();
  const { data, error } = await db.rpc("tpl_find_prospects", { p_name: name, p_zip: zip });
  if (error) {
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }

  const result = classifyMatches((data ?? []) as FindRow[]);

  if (result.kind === "one") {
    await db.rpc("tpl_record_lookup", {
      p_prospect_id: result.match.id,
      p_kind: "resolved",
      p_ip: ip === "unknown" ? null : ip,
      p_user_agent: req.headers.get("user-agent"),
    });
    return NextResponse.json({
      result: "one",
      match: { id: result.match.id, business_name: result.match.business_name, city: result.match.city, state: result.match.state },
    });
  }
  if (result.kind === "many") {
    return NextResponse.json({
      result: "many",
      matches: result.matches.map((m) => ({ id: m.id, business_name: m.business_name, city: m.city, state: m.state })),
    });
  }
  return NextResponse.json({ result: "none" });
}

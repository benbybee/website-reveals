import { NextRequest, NextResponse } from "next/server";
import { tplDb } from "@/lib/templates/db";
import { templatesEnabled } from "@/lib/templates/config";
import { normalizeZip } from "@/lib/templates/find/match";

export const dynamic = "force-dynamic";

// Step 2 of the /join flow: the visitor picked their business from the typeahead,
// now confirms it's theirs with the ZIP printed on their postcard. On a match we
// log a 'resolved' engagement event and return ok — the client then opens
// /s/<id> (the tracked redirect) to view & claim the site. ZIP is a confirmation
// step, not a hard security gate (the preview sites are public by design).
const HITS = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  if (!templatesEnabled()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let body: { id?: string; zip?: string };
  try {
    body = (await req.json()) as { id?: string; zip?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const id = (body.id ?? "").trim();
  const zip = normalizeZip(body.zip ?? "");
  if (!UUID_RE.test(id) || !zip) {
    return NextResponse.json({ ok: false });
  }

  const db = tplDb();
  const { data: row } = await db
    .from("tpl_prospects")
    .select("zip, business_name, preview_url")
    .eq("id", id)
    .not("preview_url", "is", null)
    .maybeSingle();

  if (!row || normalizeZip((row.zip as string) ?? "") !== zip) {
    return NextResponse.json({ ok: false });
  }

  // Confirmed — log the resolve. /s/<id> logs the click when they open the site.
  await db.rpc("tpl_record_lookup", {
    p_prospect_id: id,
    p_kind: "resolved",
    p_ip: ip === "unknown" ? null : ip,
    p_user_agent: req.headers.get("user-agent"),
  });

  return NextResponse.json({ ok: true, business_name: (row.business_name as string) ?? null });
}

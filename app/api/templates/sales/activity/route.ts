import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { templatesEnabled } from "@/lib/templates/config";
import { tplDb } from "@/lib/templates/db";

const KINDS = new Set(["note", "call"]);
// Structured call outcomes a rep can pick when logging a call. Free-text notes
// still go in `body`; this classifies the call for at-a-glance funnel reporting.
const CALL_OUTCOMES = new Set([
  "no_answer",
  "voicemail",
  "connected",
  "callback",
  "not_interested",
  "wrong_number",
]);

interface ActivityBody {
  prospect_id?: string;
  agent_id?: string | null;
  kind?: string;
  body?: string;
  outcome?: string;
}

/** Activity timeline for a prospect — newest first, for the drawer's history. */
export async function GET(req: NextRequest) {
  if (!templatesEnabled()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const prospectId = req.nextUrl.searchParams.get("prospect_id");
  if (!prospectId) {
    return NextResponse.json({ error: "prospect_id is required" }, { status: 400 });
  }

  const db = tplDb();
  const { data, error } = await db
    .from("tpl_sales_activity")
    .select("id, kind, body, outcome, from_stage, to_stage, agent_id, created_at")
    .eq("prospect_id", prospectId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ activity: data ?? [] });
}

/** Task 8.7 — log a sales call or note against a prospect. */
export async function POST(req: NextRequest) {
  if (!templatesEnabled()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  let body: ActivityBody;
  try {
    body = (await req.json()) as ActivityBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.prospect_id) {
    return NextResponse.json({ error: "prospect_id is required" }, { status: 400 });
  }
  if (!body.kind || !KINDS.has(body.kind)) {
    return NextResponse.json({ error: "kind must be 'note' or 'call'" }, { status: 400 });
  }
  if (!body.body || !body.body.trim()) {
    return NextResponse.json({ error: "body is required" }, { status: 400 });
  }
  if (body.outcome && !CALL_OUTCOMES.has(body.outcome)) {
    return NextResponse.json({ error: "invalid outcome" }, { status: 400 });
  }

  const db = tplDb();

  // Calls go through the atomic RPC so the activity row and the prospect's
  // call_count / last_called_at rollups update in one transaction (no race).
  // Plain notes never touch the call rollups, so they keep the direct insert.
  if (body.kind === "call") {
    const { data, error } = await db.rpc("tpl_log_call", {
      p_prospect_id: body.prospect_id,
      p_agent_id: body.agent_id ?? null,
      p_body: body.body.trim(),
      p_outcome: body.outcome ?? null,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ id: data as string }, { status: 201 });
  }

  const { data, error } = await db
    .from("tpl_sales_activity")
    .insert({
      prospect_id: body.prospect_id,
      agent_id: body.agent_id ?? null,
      kind: body.kind,
      body: body.body.trim(),
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ id: (data as { id: string }).id }, { status: 201 });
}

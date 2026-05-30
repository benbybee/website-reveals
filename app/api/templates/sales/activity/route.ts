import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { templatesEnabled } from "@/lib/templates/config";
import { tplDb } from "@/lib/templates/db";

const KINDS = new Set(["note", "call"]);

interface ActivityBody {
  prospect_id?: string;
  agent_id?: string | null;
  kind?: string;
  body?: string;
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

  const db = tplDb();
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

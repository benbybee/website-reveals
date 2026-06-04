import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { templatesEnabled } from "@/lib/templates/config";
import { tplDb } from "@/lib/templates/db";

const EDITABLE_SCALARS = ["business_name", "city", "state", "phone", "website", "website_status"] as const;

interface PatchBody {
  stage?: string;
  agent_id?: string | null;
  fields?: Partial<Record<(typeof EDITABLE_SCALARS)[number], string>>;
  record?: Record<string, unknown>;
}

/** Task 8.6 — inline prospect edits + stage/agent changes (logs stage moves). */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!templatesEnabled()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;
  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // `converted` is a special transition: it must capture owner data + fire the
  // WR→SL conversion webhook, so it goes through POST .../[id]/convert, never the
  // generic stage dropdown (which would flip the stage without promoting).
  if (body.stage === "converted") {
    return NextResponse.json(
      { error: "use_conversion_endpoint", detail: "POST /api/templates/prospects/{id}/convert" },
      { status: 409 },
    );
  }

  const db = tplDb();
  const { data: existing } = await db
    .from("tpl_prospects")
    .select("stage, record")
    .eq("id", id)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: "prospect not found" }, { status: 404 });
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.fields) {
    for (const key of EDITABLE_SCALARS) {
      if (typeof body.fields[key] === "string") update[key] = body.fields[key];
    }
  }
  if (body.record && typeof body.record === "object") {
    update.record = { ...((existing.record as Record<string, unknown>) || {}), ...body.record };
  }
  if (typeof body.stage === "string") update.stage = body.stage;
  if (body.agent_id !== undefined) update.agent_id = body.agent_id;

  const { error: updErr } = await db.from("tpl_prospects").update(update).eq("id", id);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  const priorStage = existing.stage as string;
  if (typeof body.stage === "string" && body.stage !== priorStage) {
    await db.from("tpl_sales_activity").insert({
      prospect_id: id,
      agent_id: body.agent_id ?? null,
      kind: "stage_change",
      from_stage: priorStage,
      to_stage: body.stage,
    });
  }

  return NextResponse.json({ ok: true });
}

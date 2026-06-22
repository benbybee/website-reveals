import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { templatesEnabled } from "@/lib/templates/config";
import { tplDb } from "@/lib/templates/db";
import {
  mergeRecordEdit,
  PROMOTED_COLUMNS,
  type EditableField,
} from "@/lib/templates/prospectEdit";
import { isValidLeadStatus } from "@/lib/templates/leadStatus";

interface PatchBody {
  stage?: string;
  agent_id?: string | null;
  lead_status?: string;
  fields?: Partial<Record<EditableField, string>>;
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

  if (body.lead_status !== undefined && !isValidLeadStatus(body.lead_status)) {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }

  const db = tplDb();
  const { data: existing } = await db
    .from("tpl_prospects")
    .select("stage, record, sold_at")
    .eq("id", id)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: "prospect not found" }, { status: 404 });
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.fields) {
    for (const key of PROMOTED_COLUMNS) {
      if (typeof body.fields[key] === "string") update[key] = body.fields[key];
    }
  }
  // Mirror every edit into the canonical record — it feeds scoring, the SL
  // push, the mail send, and the list/export filters; updating only the
  // promoted columns would silently diverge all of them.
  const mergedRecord = mergeRecordEdit(
    existing.record as Record<string, unknown> | null,
    body.fields,
    body.record && typeof body.record === "object" ? body.record : null,
  );
  if (mergedRecord) update.record = mergedRecord;
  if (typeof body.stage === "string") update.stage = body.stage;
  if (body.agent_id !== undefined) update.agent_id = body.agent_id;
  // lead_status: `sold` mirrors onto sold_at (preserve an existing timestamp) so
  // the Convert flow + sold filter keep working; any other status clears it.
  if (body.lead_status !== undefined) {
    update.lead_status = body.lead_status;
    if (body.lead_status === "sold") {
      update.sold_at = (existing.sold_at as string) ?? new Date().toISOString();
      update.sold_by = auth.user.email;
    } else {
      update.sold_at = null;
      update.sold_by = null;
    }
  }

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

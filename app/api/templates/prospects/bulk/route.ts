import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { templatesEnabled } from "@/lib/templates/config";
import { tplDb } from "@/lib/templates/db";

interface BulkBody {
  ids?: string[];
  mail_ready?: boolean;
  do_not_mail?: boolean;
  sales_rep_id?: string | null; // assign (uuid) or unassign (null) the rep
  suppress?: boolean; // true = move to the Suppressed list; false = restore
}

// Bulk-set the mailing eligibility flags on selected prospects. The operator
// reviews a campaign then bulk-marks "ready to mail" (mail_ready) or suppresses
// (do_not_mail) — no one-at-a-time. At least one flag must be provided.
export async function POST(req: NextRequest) {
  if (!templatesEnabled()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  let body: BulkBody;
  try {
    body = (await req.json()) as BulkBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const ids = (body.ids ?? []).filter((x) => typeof x === "string" && x);
  if (!ids.length) return NextResponse.json({ error: "no_ids" }, { status: 400 });
  if (ids.length > 5000) return NextResponse.json({ error: "too_many_ids" }, { status: 400 });
  if (
    body.mail_ready === undefined &&
    body.do_not_mail === undefined &&
    body.sales_rep_id === undefined &&
    body.suppress === undefined
  ) {
    return NextResponse.json({ error: "no_flags" }, { status: 400 });
  }

  const db = tplDb();

  // Suppress / restore is NOT a plain column write: it detaches (or re-attaches)
  // campaign_id and recomputes the campaign's counts atomically, so it goes
  // through the dedicated RPCs. A suppressed lead is no longer associated with a
  // campaign — it lives on the cross-campaign Suppressed list until restored.
  let updated = 0;
  if (body.suppress === true) {
    const { data, error } = await db.rpc("tpl_suppress_prospects", { p_ids: ids, p_by: auth.user.email, p_reason: "manual" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    updated = (data as number) ?? 0;
  } else if (body.suppress === false) {
    const { data, error } = await db.rpc("tpl_restore_prospects", { p_ids: ids });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    updated = (data as number) ?? 0;
  }

  // The remaining flags are plain column updates on the (still-attached) rows.
  const patch: Record<string, unknown> = {};
  if (body.mail_ready !== undefined) patch.mail_ready = body.mail_ready;
  if (body.do_not_mail !== undefined) {
    patch.do_not_mail = body.do_not_mail;
    if (body.do_not_mail === true) patch.mail_ready = false; // can't be ready + do-not-mail
  }
  if (body.sales_rep_id !== undefined) patch.sales_rep_id = body.sales_rep_id || null;

  if (Object.keys(patch).length > 0) {
    patch.updated_at = new Date().toISOString();
    const { data, error } = await db.from("tpl_prospects").update(patch).in("id", ids).select("id");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    updated = (data ?? []).length;
  }

  return NextResponse.json({ ok: true, updated });
}

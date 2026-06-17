import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { templatesEnabled } from "@/lib/templates/config";
import { tplDb } from "@/lib/templates/db";

interface BulkBody {
  ids?: string[];
  mail_ready?: boolean;
  do_not_mail?: boolean;
  sales_rep_id?: string | null; // assign (uuid) or unassign (null) the rep
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
  if (body.mail_ready === undefined && body.do_not_mail === undefined && body.sales_rep_id === undefined) {
    return NextResponse.json({ error: "no_flags" }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.mail_ready !== undefined) patch.mail_ready = body.mail_ready;
  if (body.do_not_mail !== undefined) {
    patch.do_not_mail = body.do_not_mail;
    // Suppressing a prospect also clears its ready flag so it can't slip through.
    if (body.do_not_mail === true) patch.mail_ready = false;
  }
  // Assign (or clear, with null) the rep who owns these leads in the portal.
  if (body.sales_rep_id !== undefined) patch.sales_rep_id = body.sales_rep_id || null;

  const db = tplDb();
  const { data, error } = await db
    .from("tpl_prospects")
    .update(patch)
    .in("id", ids)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, updated: (data ?? []).length });
}

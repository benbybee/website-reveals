import { NextRequest, NextResponse } from "next/server";
import { getSalesRepSession } from "@/lib/sales-rep-auth";
import { getSalesRepById } from "@/lib/sales-reps";
import { tplDb } from "@/lib/templates/db";
import { logAudit } from "@/lib/audit-log";
import { sendTelegramMessage } from "@/lib/telegram";
import { isNotificationEnabled } from "@/lib/notification-settings";
import { isValidLeadStatus } from "@/lib/templates/leadStatus";

/**
 * Sales rep sets the pipeline status on one of THEIR template leads
 * (new / no_answer / follow_up / scheduled_demo / contacted / not_interested /
 * sold). `sold` is mirrored onto sold_at so the operator's Convert flow + sold
 * filter keep working; any other status clears it. Rep may only touch a lead
 * whose tpl_prospects.sales_rep_id matches their session. Setting `sold` is NOT a
 * conversion — the operator converts later.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSalesRepSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { status?: unknown } | null;
  if (!isValidLeadStatus(body?.status)) {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }
  const status = body!.status;
  const sold = status === "sold";

  const db = tplDb();
  const { data: row } = await db
    .from("tpl_prospects")
    .select("id, sales_rep_id, business_name, sold_at, lead_status")
    .eq("id", id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (row.sales_rep_id !== session.rep_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (row.lead_status === status) return NextResponse.json({ ok: true, idempotent: true });

  const nowIso = new Date().toISOString();
  const { error: updErr } = await db
    .from("tpl_prospects")
    .update({
      lead_status: status,
      sold_at: sold ? (row.sold_at ?? nowIso) : null,
      sold_by: sold ? session.rep_id : null,
      updated_at: nowIso,
    })
    .eq("id", id);
  if (updErr) return NextResponse.json({ error: "update_failed" }, { status: 500 });

  void logAudit({
    actor_type: "sales_rep",
    actor_id: session.rep_id,
    action: "tpl_prospect.status_changed",
    target_type: "tpl_prospect",
    target_id: id,
    details: { business_name: row.business_name, from: row.lead_status, to: status },
  });

  // Tell the operator when a lead is sold so they know to convert it.
  if (sold && !row.sold_at && (await isNotificationEnabled("admin").catch(() => true))) {
    const rep = await getSalesRepById(session.rep_id);
    const repName = rep ? `${rep.first_name}${rep.last_name ? " " + rep.last_name : ""}` : session.email;
    try {
      await sendTelegramMessage(
        `✅ SOLD (template) — ${row.business_name ?? id}\nRep: ${repName}\nMark converted in /admin/templates/sales when ready.`,
      );
    } catch (e) {
      console.error("[sales-rep:tpl-status] telegram failed:", e);
    }
  }

  return NextResponse.json({ ok: true, status });
}

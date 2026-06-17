import { NextRequest, NextResponse } from "next/server";
import { getSalesRepSession } from "@/lib/sales-rep-auth";
import { getSalesRepById } from "@/lib/sales-reps";
import { tplDb } from "@/lib/templates/db";
import { logAudit } from "@/lib/audit-log";
import { sendTelegramMessage } from "@/lib/telegram";
import { isNotificationEnabled } from "@/lib/notification-settings";

/**
 * Sales rep marks one of THEIR template leads "sold" (or un-sold). This is NOT a
 * conversion — it flags the lead so the operator converts it later. Rep may only
 * touch a lead whose tpl_prospects.sales_rep_id matches their session.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSalesRepSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { sold?: unknown } | null;
  const sold = body?.sold !== false; // default true; pass {sold:false} to clear

  const db = tplDb();
  const { data: row } = await db
    .from("tpl_prospects")
    .select("id, sales_rep_id, business_name, sold_at")
    .eq("id", id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (row.sales_rep_id !== session.rep_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (sold && row.sold_at) return NextResponse.json({ ok: true, idempotent: true });
  if (!sold && !row.sold_at) return NextResponse.json({ ok: true, idempotent: true });

  const nowIso = new Date().toISOString();
  const { error: updErr } = await db
    .from("tpl_prospects")
    .update({ sold_at: sold ? nowIso : null, sold_by: sold ? session.rep_id : null, updated_at: nowIso })
    .eq("id", id);
  if (updErr) return NextResponse.json({ error: "update_failed" }, { status: 500 });

  void logAudit({
    actor_type: "sales_rep",
    actor_id: session.rep_id,
    action: sold ? "tpl_prospect.marked_sold" : "tpl_prospect.unmarked_sold",
    target_type: "tpl_prospect",
    target_id: id,
    details: { business_name: row.business_name },
  });

  // Tell the operator a lead is sold so they know to convert it.
  if (sold && (await isNotificationEnabled("admin").catch(() => true))) {
    const rep = await getSalesRepById(session.rep_id);
    const repName = rep ? `${rep.first_name}${rep.last_name ? " " + rep.last_name : ""}` : session.email;
    try {
      await sendTelegramMessage(
        `✅ SOLD (template) — ${row.business_name ?? id}\nRep: ${repName}\nMark converted in /admin/templates/sales when ready.`,
      );
    } catch (e) {
      console.error("[sales-rep:tpl-sold] telegram failed:", e);
    }
  }

  return NextResponse.json({ ok: true, sold });
}

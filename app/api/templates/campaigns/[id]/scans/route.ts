import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { templatesEnabled } from "@/lib/templates/config";
import { tplDb } from "@/lib/templates/db";

// Campaign-level QR funnel rollup: mailed -> prospects scanned -> total scans.
// Three head-count queries (no row payloads) so it stays cheap on large
// campaigns. Powers the at-a-glance summary in the mail panel.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!templatesEnabled()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;
  const db = tplDb();

  const [mailed, scanned, scans] = await Promise.all([
    db.from("tpl_mailings").select("id", { count: "exact", head: true }).eq("campaign_id", id).eq("status", "sent"),
    db.from("tpl_mailings").select("id", { count: "exact", head: true }).eq("campaign_id", id).gt("scan_count", 0),
    db.from("tpl_qr_scans").select("id", { count: "exact", head: true }).eq("campaign_id", id),
  ]);

  return NextResponse.json({
    ok: true,
    mailed: mailed.count ?? 0,
    prospectsScanned: scanned.count ?? 0,
    totalScans: scans.count ?? 0,
  });
}

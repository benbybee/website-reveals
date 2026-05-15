import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createServerClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit-log";

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { client_ids, sales_rep_id } = body as { client_ids?: unknown; sales_rep_id?: unknown };
  if (!Array.isArray(client_ids) || client_ids.length === 0) {
    return NextResponse.json({ error: "client_ids must be a non-empty array" }, { status: 400 });
  }
  const repId = typeof sales_rep_id === "string" && sales_rep_id ? sales_rep_id : null;

  const supabase = createServerClient();
  const { data: updated, error } = await supabase
    .from("clients")
    .update({ sales_rep_id: repId, updated_at: new Date().toISOString() })
    .in("id", client_ids as string[])
    .select("id, sales_rep_id");

  if (error) {
    console.error("[clients/bulk-assign] update failed:", error.message);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  void logAudit({
    actor_type: "admin",
    actor_id: auth.user?.email || null,
    action: "client.bulk_assigned",
    target_type: "client",
    details: {
      count: (updated || []).length,
      sales_rep_id: repId,
      client_ids,
    },
  });

  return NextResponse.json({ updated: (updated || []).length });
}

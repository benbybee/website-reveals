import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { setNotificationEnabled, type NotificationAudience } from "@/lib/notification-settings";

const VALID_AUDIENCES: NotificationAudience[] = ["client", "sales_rep", "admin"];

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { audience, enabled } = body as { audience?: unknown; enabled?: unknown };
  if (typeof audience !== "string" || !VALID_AUDIENCES.includes(audience as NotificationAudience)) {
    return NextResponse.json({ error: "Invalid audience" }, { status: 400 });
  }
  if (typeof enabled !== "boolean") {
    return NextResponse.json({ error: "enabled must be boolean" }, { status: 400 });
  }

  const { error } = await setNotificationEnabled(audience as NotificationAudience, enabled);
  if (error) {
    console.error("[notify-settings] update failed:", error.message);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

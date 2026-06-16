import { NextRequest, NextResponse } from "next/server";
import { tplDb } from "@/lib/templates/db";
import { qrBaseUrl } from "@/lib/templates/mail/qr";

// Public click redirect for the /join lookup. Logs a 'clicked' engagement event
// for the prospect, then 302s to their preview. Not behind templatesEnabled (a
// printed/shared link must keep working) and never throws for the visitor.
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let target = qrBaseUrl();

  try {
    const db = tplDb();
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
    const { data } = await db.rpc("tpl_record_lookup", {
      p_prospect_id: id,
      p_kind: "clicked",
      p_ip: ip,
      p_user_agent: req.headers.get("user-agent"),
    });
    if (typeof data === "string" && data.trim()) target = data;
  } catch {
    // Never break the redirect for a visitor.
  }

  return NextResponse.redirect(target, 302);
}

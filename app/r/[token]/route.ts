import { NextRequest, NextResponse } from "next/server";
import { tplDb } from "@/lib/templates/db";
import { qrBaseUrl } from "@/lib/templates/mail/qr";

// Public QR landing redirect. A business owner scanning a mailed postcard hits
// this first; we log the scan (attributed to the exact card via its token) and
// then 302 them to their speculative preview.
//
// Deliberately NOT behind requireAdmin (the scanner is an anonymous recipient)
// and NOT behind templatesEnabled (a printed card must keep working even if the
// feature flag is later toggled). It also never throws for the recipient — any
// failure falls through to the marketing site so a scan is never a dead end.
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  let target = qrBaseUrl();

  try {
    const db = tplDb();
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
    const { data } = await db.rpc("tpl_record_qr_scan", {
      p_token: token,
      p_ip: ip,
      p_user_agent: req.headers.get("user-agent"),
      p_referer: req.headers.get("referer"),
    });
    if (typeof data === "string" && data.trim()) target = data;
  } catch {
    // Never break the redirect for a scanning recipient.
  }

  return NextResponse.redirect(target, 302);
}

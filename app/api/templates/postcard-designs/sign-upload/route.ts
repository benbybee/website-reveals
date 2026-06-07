import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { templatesEnabled } from "@/lib/templates/config";
import { tplDb } from "@/lib/templates/db";
import { signPostcardUpload } from "@/lib/templates/mail/storage";

interface SignBody {
  designName?: string;
  side?: "front" | "back";
  contentType?: string;
}

// Mint a one-time signed upload URL so the browser can PUT postcard artwork
// straight to Supabase Storage, bypassing the serverless function's request-body
// cap. The client then sends only the resulting public URL as JSON metadata.
export async function POST(req: NextRequest) {
  if (!templatesEnabled()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  let body: SignBody;
  try {
    body = (await req.json()) as SignBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (body.side !== "front" && body.side !== "back") {
    return NextResponse.json({ error: "invalid_side" }, { status: 400 });
  }
  if (!body.contentType) return NextResponse.json({ error: "missing_content_type" }, { status: 400 });

  try {
    const signed = await signPostcardUpload(tplDb(), {
      designName: body.designName?.trim() || "design",
      side: body.side,
      contentType: body.contentType,
    });
    return NextResponse.json({ ok: true, ...signed });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "sign_failed" }, { status: 400 });
  }
}

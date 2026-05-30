import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { verifyCallback } from "@/lib/sitelaunchr";
import { templatesEnabled } from "@/lib/templates/config";
import { slStatusToStage } from "@/lib/templates/sl/callbackStatus";

interface RecordStatus {
  source_id: string;
  status: string;
  preview_url?: string | null;
  error?: string | null;
}

interface TplCallbackBody {
  batch_id?: string;
  records: RecordStatus[];
}

/**
 * SL build-status callback for the Template Site pipeline. Fully separate from
 * the form-flow /api/sl-callback handler. Verifies HMAC + timestamp (reusing
 * SITELAUNCHR_HMAC_SECRET), then applies per-record stage transitions on
 * tpl_prospects keyed by stable source_id.
 */
export async function POST(req: NextRequest) {
  if (!templatesEnabled()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const hmacSecret = (process.env.SITELAUNCHR_HMAC_SECRET || "").trim();
  if (!hmacSecret) {
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }

  const timestamp = req.headers.get("x-timestamp");
  const signature = req.headers.get("x-signature");
  if (!timestamp || !signature) {
    return NextResponse.json({ error: "missing_headers" }, { status: 401 });
  }

  const rawBody = await req.text();
  const verification = verifyCallback(timestamp, rawBody, signature, hmacSecret);
  if (!verification.ok) {
    return NextResponse.json({ error: verification.reason }, { status: 401 });
  }

  let body: TplCallbackBody;
  try {
    body = JSON.parse(rawBody) as TplCallbackBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!Array.isArray(body.records) || body.records.length === 0) {
    return NextResponse.json({ error: "missing_records" }, { status: 400 });
  }

  const supabase = createServerClient();
  const applied: string[] = [];
  const ignored: string[] = [];

  for (const rec of body.records) {
    const stage = slStatusToStage(rec.status);
    if (!rec.source_id || !stage) {
      ignored.push(rec.source_id ?? "(no source_id)");
      continue;
    }

    const { data: existing } = await supabase
      .from("tpl_prospects")
      .select("record")
      .eq("source_id", rec.source_id)
      .maybeSingle();
    if (!existing) {
      ignored.push(rec.source_id);
      continue;
    }

    const record = (existing.record as Record<string, unknown>) || {};
    if (rec.preview_url) record.preview_url = rec.preview_url;
    if (stage === "build_failed" && rec.error) record.build_error = String(rec.error).slice(0, 500);

    const { error: updErr } = await supabase
      .from("tpl_prospects")
      .update({ stage, record, updated_at: new Date().toISOString() })
      .eq("source_id", rec.source_id);
    if (updErr) {
      ignored.push(rec.source_id);
      continue;
    }
    applied.push(rec.source_id);
  }

  return NextResponse.json({ ok: true, applied: applied.length, ignored: ignored.length });
}

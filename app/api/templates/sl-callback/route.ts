import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { verifyCallback } from "@/lib/sitelaunchr";
import { templatesEnabled, SL_TEMPLATE_HMAC_SECRET } from "@/lib/templates/config";
import { slStatusToStage } from "@/lib/templates/sl/callbackStatus";

// SL posts one flat callback per phase transition (not a batch). We key on the
// echoed external_id (== our source_id). Only the fields we consume are typed;
// SL sends more (wp_admin_url, kura_*, github_run_url, …) which we ignore.
interface TplCallbackBody {
  build_id?: string;
  external_id?: string;
  source_id?: string; // tolerate either spelling for the dedup key
  status: string;
  // SL's terminal preview URL arrives as site_url (there is no preview_url field).
  site_url?: string | null;
  error_message?: string | null;
}

/**
 * SL build-status callback for the Template Site pipeline. Fully separate from
 * the form-flow /api/sl-callback handler. Verifies HMAC + timestamp using the
 * wr-template source's own secret (SL_TEMPLATE_HMAC_SECRET — wr-template is a
 * distinct SL source from `wr`, signed with its own secret), then applies the
 * per-build stage transition on tpl_prospects keyed by stable source_id.
 */
export async function POST(req: NextRequest) {
  if (!templatesEnabled()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const hmacSecret = SL_TEMPLATE_HMAC_SECRET();
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

  const key = body.external_id ?? body.source_id;
  if (!key) {
    return NextResponse.json({ error: "missing_external_id" }, { status: 400 });
  }

  const stage = slStatusToStage(body.status);
  if (!stage) {
    // Unrecognized phase — ack so SL stops retrying, but change nothing.
    return NextResponse.json({ ok: true, applied: 0, ignored: 1 });
  }

  const supabase = createServerClient();
  const { data: existing } = await supabase
    .from("tpl_prospects")
    .select("record")
    .eq("source_id", key)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ ok: true, applied: 0, ignored: 1 });
  }

  const record = (existing.record as Record<string, unknown>) || {};
  if (body.build_id) record.sl_build_id = body.build_id;
  // SL's site_url is the pages.dev preview; surface it as preview_url, which the
  // sales board already reads for its "view" link.
  if (body.site_url) record.preview_url = body.site_url;
  if (stage === "build_failed" && body.error_message) {
    record.build_error = String(body.error_message).slice(0, 500);
  }

  const { error: updErr } = await supabase
    .from("tpl_prospects")
    .update({ stage, record, updated_at: new Date().toISOString() })
    .eq("source_id", key);
  if (updErr) {
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, applied: 1, ignored: 0 });
}

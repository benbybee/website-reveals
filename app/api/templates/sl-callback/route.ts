import { NextRequest, NextResponse, after } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { verifyCallback } from "@/lib/sitelaunchr";
import { templatesEnabled, SL_TEMPLATE_HMAC_SECRET } from "@/lib/templates/config";
import { slStatusToStage } from "@/lib/templates/sl/callbackStatus";
import { resolveBuildCostUsd } from "@/lib/templates/sl/buildCost";
import { escalateTerminalBuild } from "@/lib/templates/sl/escalateBuild";

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
  // Real per-build cost (G-C4): SL emits cost_usd (preferred, verbatim) and/or a
  // usage token block on terminal callbacks; WR records it in tpl_cost_events.
  cost_usd?: number | null;
  usage?: {
    model?: string | null;
    input_tokens?: number | null;
    output_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
    cache_read_input_tokens?: number | null;
    cache_creation_tokens?: number | null;
    cache_read_tokens?: number | null;
  } | null;
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
    .select("record, sales_rep_id, business_name, campaign_id")
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

  const patch: Record<string, unknown> = { stage, record, updated_at: new Date().toISOString() };
  if (body.build_id) patch.sl_build_id = body.build_id;
  if (body.site_url) patch.preview_url = body.site_url;
  const { error: updErr } = await supabase
    .from("tpl_prospects")
    .update(patch)
    .eq("source_id", key);
  if (updErr) {
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  // Terminal-build escalation (rep email + real cost) — shared with the reconcile
  // cron so a dropped-callback recovery is a full-fidelity replay. Runs after the
  // ack; the helper is best-effort and never throws. cost_usd/usage rides the
  // terminal callback (G-C4); the reconcile path has no cost, so it passes null.
  if (stage === "live" || stage === "build_failed") {
    const ex = existing as {
      sales_rep_id?: string | null;
      business_name?: string | null;
      campaign_id?: string | null;
    };
    const cost = resolveBuildCostUsd(body);
    after(() =>
      escalateTerminalBuild(supabase, {
        sourceId: key,
        stage,
        businessName: ex.business_name ?? null,
        salesRepId: ex.sales_rep_id ?? null,
        campaignId: ex.campaign_id ?? null,
        previewUrl: body.site_url ?? null,
        errorMessage: body.error_message ?? null,
        buildId: body.build_id ?? null,
        costUsd: cost,
      }),
    );
  }

  return NextResponse.json({ ok: true, applied: 1, ignored: 0 });
}

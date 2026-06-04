import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { templatesEnabled } from "@/lib/templates/config";
import { tplDb } from "@/lib/templates/db";
import { isValidSlug } from "@/lib/templates/normalize/slug";
import { postConversion, validateConversionInput, type ConversionInput } from "@/lib/templates/sl/convert";

// A prospect may only be converted once its speculative preview is ready
// (build stage `live` == SL `succeeded`). `converted` is allowed too so a
// transient retry can re-fire (SL is idempotent on external_id). Anything else
// would just earn a 409 build_not_ready from SL.
const CONVERTIBLE_STAGES = new Set(["live", "converted"]);

interface ConvertBody {
  owner_email?: string;
  owner_name?: string;
  slug?: string;
  industry?: string;
  domain_name?: string;
  ghl_webhook_url?: string;
}

/**
 * Stage-2 conversion trigger. The sales rep marks a prospect converted (no
 * Stripe/payment in v1 — operator decision, PIPELINE-COORDINATION.md §7
 * @OPERATOR 2026-06-03). This captures the owner data collected on the call
 * (kura_input) and fires the signed WR→SL conversion webhook to
 * `POST /api/conversions`, which dispatches the Kura promote. Idempotent on the
 * prospect's source_id (== SL external_id). Conversion is intentionally NOT
 * reachable via the generic PATCH stage dropdown, because it must capture owner
 * data and fire this webhook.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!templatesEnabled()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;
  let body: ConvertBody;
  try {
    body = (await req.json()) as ConvertBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const db = tplDb();
  const { data: existing } = await db
    .from("tpl_prospects")
    .select("stage, source_id, record")
    .eq("id", id)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: "prospect_not_found" }, { status: 404 });
  }

  const priorStage = existing.stage as string;
  const externalId = (existing.source_id as string) || "";
  const record = (existing.record as Record<string, unknown>) || {};

  if (!externalId) {
    // No Stage-1 build was ever dispatched for this prospect → nothing for SL
    // to promote.
    return NextResponse.json({ error: "no_build" }, { status: 409 });
  }
  if (!CONVERTIBLE_STAGES.has(priorStage)) {
    return NextResponse.json({ error: "build_not_ready", stage: priorStage }, { status: 409 });
  }

  const input: ConversionInput = {
    external_id: externalId,
    slug: (body.slug ?? "").trim(),
    owner_email: (body.owner_email ?? "").trim(),
    owner_name: body.owner_name?.trim() || undefined,
    industry:
      body.industry?.trim() ||
      (record.industry_raw as string | undefined) ||
      (record.industry_slug as string | undefined) ||
      undefined,
    domain_name: body.domain_name?.trim() || undefined,
    ghl_webhook_url: body.ghl_webhook_url?.trim() || undefined,
  };

  const valid = validateConversionInput(input);
  if (!valid.ok) {
    const slugBad = valid.missing.includes("slug") && !isValidSlug(input.slug);
    return NextResponse.json(
      { error: "invalid_conversion_input", missing: valid.missing, ...(slugBad ? { slug_hint: "lowercase letters, numbers, hyphens; 1–60 chars; no leading/trailing hyphen" } : {}) },
      { status: 400 },
    );
  }

  // Persist the captured owner data BEFORE firing, so a transient failure (or a
  // build_not_ready retry) keeps the rep's input rather than forcing re-entry.
  // The stage flips to `converted` only after SL accepts.
  const kuraInput: Record<string, unknown> = { slug: input.slug, owner_email: input.owner_email };
  if (input.owner_name) kuraInput.owner_name = input.owner_name;
  if (input.industry) kuraInput.industry = input.industry;
  const conversionMeta: Record<string, unknown> = {
    requested_at: new Date().toISOString(),
    requested_by: auth.user.email,
  };
  if (input.domain_name) conversionMeta.domain_name = input.domain_name;

  const stagedRecord: Record<string, unknown> = {
    ...record,
    kura_input: kuraInput,
    conversion: { ...((record.conversion as Record<string, unknown>) ?? {}), ...conversionMeta },
  };
  await db.from("tpl_prospects").update({ record: stagedRecord, updated_at: new Date().toISOString() }).eq("id", id);

  let outcome;
  try {
    outcome = await postConversion(input);
  } catch (err) {
    // Misconfiguration (missing URL/key/secret) — not a client error.
    return NextResponse.json(
      { error: "conversion_not_configured", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }

  if (outcome.ok) {
    const confirmedRecord: Record<string, unknown> = {
      ...stagedRecord,
      conversion: {
        ...(stagedRecord.conversion as Record<string, unknown>),
        status: outcome.status,
        confirmed_at: new Date().toISOString(),
        ...(outcome.build_id ? { sl_build_id: outcome.build_id } : {}),
      },
    };
    await db
      .from("tpl_prospects")
      .update({ stage: "converted", record: confirmedRecord, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (priorStage !== "converted") {
      await db.from("tpl_sales_activity").insert({
        prospect_id: id,
        agent_id: auth.user.email,
        kind: "stage_change",
        from_stage: priorStage,
        to_stage: "converted",
      });
    }
    return NextResponse.json({ ok: true, status: outcome.status, build_id: outcome.build_id ?? null });
  }

  // Failure: owner data is already saved; surface a classified error so the UI
  // can tell the rep whether to retry.
  if (outcome.status === "build_not_ready") {
    return NextResponse.json({ error: "build_not_ready", retryable: true }, { status: 409 });
  }
  if (outcome.status === "build_not_found") {
    return NextResponse.json({ error: "build_not_found", retryable: false }, { status: 404 });
  }
  return NextResponse.json(
    { error: outcome.error, retryable: outcome.retryable },
    { status: outcome.retryable ? 502 : 400 },
  );
}

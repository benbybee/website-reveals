import { signPayload } from "@/lib/sitelaunchr";
import {
  SL_TEMPLATE_CONVERSION_URL,
  SL_TEMPLATE_SOURCE_ID,
  SL_TEMPLATE_API_KEY,
  SL_TEMPLATE_HMAC_SECRET,
} from "../config";
import { isValidSlug } from "../normalize/slug";

/**
 * WR → SL Stage-2 conversion payload (`POST /api/conversions`). Field names are
 * LOCKED by SL's `.strict()` schema — see PIPELINE-COORDINATION.md §7
 * [SL] 2026-06-03 "(2) O3 CONVERSION ENDPOINT". `external_id` is the SAME dedup
 * key WR sent at Stage-1 intake (the prospect source_id); SL resolves the build
 * by (source_id, external_id). WR sends NO build_id and NO kura_project_id.
 */
export interface ConversionPayload {
  external_id: string;
  kura_input: {
    slug: string;
    owner_email: string;
    owner_name?: string;
    industry?: string;
  };
  domain?: { name: string };
  contact?: { ghl_webhook_url: string };
}

export interface ConversionInput {
  external_id: string;
  slug: string;
  owner_email: string;
  owner_name?: string;
  industry?: string;
  domain_name?: string;
  ghl_webhook_url?: string;
}

/** Build the SL conversion body, omitting absent optionals (SL is .strict()). */
export function buildConversionPayload(input: ConversionInput): ConversionPayload {
  const kura_input: ConversionPayload["kura_input"] = {
    slug: input.slug,
    owner_email: input.owner_email,
  };
  if (nonEmpty(input.owner_name)) kura_input.owner_name = input.owner_name!.trim();
  if (nonEmpty(input.industry)) kura_input.industry = input.industry!.trim();

  const payload: ConversionPayload = { external_id: input.external_id, kura_input };
  if (nonEmpty(input.domain_name)) payload.domain = { name: input.domain_name!.trim() };
  // SL re-validates the ghl allowlist server-side and silently drops a
  // disallowed URL, so we forward whatever we have without gating here.
  if (nonEmpty(input.ghl_webhook_url)) payload.contact = { ghl_webhook_url: input.ghl_webhook_url!.trim() };
  return payload;
}

export function validateConversionInput(input: ConversionInput): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!nonEmpty(input.external_id)) missing.push("external_id");
  if (!nonEmpty(input.owner_email)) missing.push("owner_email");
  if (!isValidSlug(input.slug)) missing.push("slug");
  return { ok: missing.length === 0, missing };
}

/**
 * Outcome of a conversion POST, classified against SL's documented responses so
 * the caller can act without re-parsing HTTP. `retryable` marks transient
 * failures (preview not yet ready, 429, 5xx) the rep/UI can safely re-fire —
 * the whole call is idempotent on external_id at SL.
 */
export type ConversionOutcome =
  | { ok: true; status: "converting"; httpStatus: number; build_id?: string }
  | { ok: true; status: "already_converting"; httpStatus: number; build_id?: string }
  | { ok: false; status: "build_not_ready"; httpStatus: number; retryable: true; error: string }
  | { ok: false; status: "build_not_found"; httpStatus: number; retryable: false; error: string }
  | { ok: false; status: "error"; httpStatus: number; retryable: boolean; error: string };

export interface ConversionContext {
  url?: string;
  apiKey?: string;
  hmacSecret?: string;
}

/**
 * Sign + POST one conversion to SL's /api/conversions as the wr-template source,
 * using the SAME HMAC scheme as intake (x-source-id + x-api-key + signed body).
 * The serialized bytes are signed once and sent verbatim. Never throws on an
 * HTTP error — returns a classified ConversionOutcome instead.
 */
export async function postConversion(
  input: ConversionInput,
  ctx: ConversionContext = {},
): Promise<ConversionOutcome> {
  const url = ctx.url ?? SL_TEMPLATE_CONVERSION_URL();
  const apiKey = ctx.apiKey ?? SL_TEMPLATE_API_KEY();
  const secret = ctx.hmacSecret ?? SL_TEMPLATE_HMAC_SECRET();
  if (!url) throw new Error("postConversion requires SL_TEMPLATE_CONVERSION_URL");
  if (!apiKey) throw new Error("postConversion requires SL_TEMPLATE_API_KEY");
  if (!secret) throw new Error("postConversion requires SL_TEMPLATE_HMAC_SECRET");

  const payload = buildConversionPayload(input);
  const rawBody = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = signPayload(timestamp, rawBody, secret);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-source-id": SL_TEMPLATE_SOURCE_ID,
        "x-api-key": apiKey,
        "x-timestamp": timestamp,
        "x-signature": signature,
      },
      body: rawBody,
    });
  } catch (err) {
    // Network failure → transient, safe to retry (idempotent on external_id).
    return { ok: false, status: "error", httpStatus: 0, retryable: true, error: err instanceof Error ? err.message : String(err) };
  }

  return classifyConversionResponse(res.status, await readJson(res));
}

/** Map SL's (status, body) to a ConversionOutcome per the locked contract. */
export function classifyConversionResponse(
  httpStatus: number,
  body: Record<string, unknown>,
): ConversionOutcome {
  const build_id = typeof body.build_id === "string" ? body.build_id : undefined;
  const err = (typeof body.error === "string" && body.error) || `http_${httpStatus}`;

  // 200 already-in-flight is idempotent success.
  if (httpStatus === 200 && body.already_converting === true) {
    return { ok: true, status: "already_converting", httpStatus, build_id };
  }
  if (httpStatus === 202 || (httpStatus === 200 && body.status === "converting")) {
    return { ok: true, status: "converting", httpStatus, build_id };
  }
  if (httpStatus === 404) {
    return { ok: false, status: "build_not_found", httpStatus, retryable: false, error: err };
  }
  // 409 build_not_ready = preview not yet `succeeded`; retry once it is.
  if (httpStatus === 409 && body.error === "build_not_ready") {
    return { ok: false, status: "build_not_ready", httpStatus, retryable: true, error: err };
  }
  // 429 / 5xx are transient; other 4xx (incl. a non-template 409, 403
  // not_a_conversion_source) are not.
  const retryable = httpStatus === 429 || httpStatus >= 500;
  return { ok: false, status: "error", httpStatus, retryable, error: err };
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function nonEmpty(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

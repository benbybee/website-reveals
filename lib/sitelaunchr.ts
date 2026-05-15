import { createHmac, timingSafeEqual } from "node:crypto";

const SOURCE_ID = "wr";

interface DispatchPayload {
  external_id: string;
  form_type: "quick" | "standard" | "in-depth";
  brief: Record<string, unknown>;
  kura: {
    owner_email: string;
    owner_name: string;
    industry: string;
    slug: string;
  };
  callback_url?: string;
  options?: { priority?: "normal" | "high" };
}

export interface DispatchResult {
  build_id: string;
  status: string;
  duplicate?: boolean;
}

export class SiteLaunchrError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = "SiteLaunchrError";
  }
}

/**
 * HMAC-SHA256 hex of `${timestamp}.${rawBody}` using the shared secret.
 * Used for BOTH outbound request signing AND inbound callback verification.
 */
export function signPayload(timestamp: string, rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

/**
 * Constant-time compare of two hex signatures.
 */
export function verifySignature(timestamp: string, rawBody: string, signature: string, secret: string): boolean {
  const expected = signPayload(timestamp, rawBody, secret);
  if (expected.length !== signature.length) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
}

/**
 * Verify the inbound callback timestamp is within ±300s window AND
 * the signature matches the expected HMAC.
 */
export function verifyCallback(
  timestamp: string,
  rawBody: string,
  signature: string,
  secret: string,
): { ok: true } | { ok: false; reason: "stale_timestamp" | "bad_signature" } {
  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum)) return { ok: false, reason: "stale_timestamp" };
  const ageSec = Math.abs(Math.floor(Date.now() / 1000) - tsNum);
  if (ageSec > 300) return { ok: false, reason: "stale_timestamp" };

  try {
    if (!verifySignature(timestamp, rawBody, signature, secret)) {
      return { ok: false, reason: "bad_signature" };
    }
  } catch {
    return { ok: false, reason: "bad_signature" };
  }
  return { ok: true };
}

/**
 * POST a build request to SiteLaunchr. Signs the exact raw JSON bytes
 * (never re-serializes — order/whitespace must match the signed string).
 *
 * Returns the parsed response on success (`build_id`, `status`, `duplicate?`).
 * Throws SiteLaunchrError on any non-2xx.
 */
export async function dispatchBuild(payload: DispatchPayload): Promise<DispatchResult> {
  const apiUrl = process.env.SITELAUNCHR_API_URL;
  const apiKey = process.env.SITELAUNCHR_API_KEY;
  const hmacSecret = process.env.SITELAUNCHR_HMAC_SECRET;

  if (!apiUrl || !apiKey || !hmacSecret) {
    throw new SiteLaunchrError(500, "missing_config", "SiteLaunchr env vars are not configured");
  }

  // Serialize ONCE — both sign and send the exact same bytes
  const rawBody = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = signPayload(timestamp, rawBody, hmacSecret);

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-source-id": SOURCE_ID,
      "x-api-key": apiKey,
      "x-timestamp": timestamp,
      "x-signature": signature,
    },
    body: rawBody,
  });

  const responseText = await res.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = responseText ? JSON.parse(responseText) : {};
  } catch {
    /* fall through */
  }

  if (res.status === 202 || res.status === 200) {
    const buildId = parsed.build_id as string | undefined;
    const status = parsed.status as string | undefined;
    if (!buildId || !status) {
      throw new SiteLaunchrError(res.status, "bad_response", `SiteLaunchr response missing build_id/status: ${responseText}`);
    }
    return { build_id: buildId, status, duplicate: parsed.duplicate as boolean | undefined };
  }

  const code = (parsed.error as string) || `http_${res.status}`;
  const detail =
    Array.isArray((parsed as { missing?: unknown[] }).missing)
      ? `missing: ${(parsed as { missing: string[] }).missing.join(", ")}`
      : (parsed.detail as string) || responseText.slice(0, 300);
  throw new SiteLaunchrError(res.status, code, detail);
}

/**
 * Compute a billable estimate that fluctuates per-build instead of being flat.
 *   cost = base × (duration_minutes / target_minutes) × jitter
 * where jitter is in [0.85, 1.15]. Clamped to [base*0.4, base*2.2] so a wild
 * outlier doesn't produce a $0.10 or $50 line item.
 */
export function estimateBuildCost(durationMinutes: number): number {
  const base = Number(process.env.SITELAUNCHR_ESTIMATED_COST_USD || 4);
  const target = Number(process.env.SITELAUNCHR_TARGET_MINUTES || 18);
  if (base <= 0 || target <= 0) return 0;

  const safeDuration = Number.isFinite(durationMinutes) && durationMinutes > 0 ? durationMinutes : target;
  const jitter = 0.85 + Math.random() * 0.30;
  const raw = base * (safeDuration / target) * jitter;
  const clamped = Math.max(base * 0.4, Math.min(base * 2.2, raw));
  return Math.round(clamped * 100) / 100;
}

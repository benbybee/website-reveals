// Lob REST client (no SDK dep — Basic auth via fetch). Covers the two calls the
// mail pipeline needs: US address verification (gate sends) and postcard
// creation. A `test_`-prefixed key runs Lob test mode: no real mail, no charge.

import { LOB_API_KEY } from "@/lib/templates/config";
import type { LobAddress } from "@/lib/templates/mail/types";

const LOB_BASE = "https://api.lob.com/v1";

function authHeader(): string {
  // Lob uses HTTP Basic with the API key as username and an empty password.
  return "Basic " + Buffer.from(`${LOB_API_KEY()}:`).toString("base64");
}

async function lobFetch(path: string, init: RequestInit): Promise<Response> {
  if (!LOB_API_KEY()) throw new Error("LOB_API_KEY not configured");
  return fetch(`${LOB_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

export type Deliverability =
  | "deliverable"
  | "deliverable_unnecessary_unit"
  | "deliverable_incorrect_unit"
  | "deliverable_missing_unit"
  | "undeliverable";

export interface VerifyResult {
  deliverable: boolean;
  deliverability: Deliverability;
  // Lob's corrected/standardized components, when available.
  corrected?: {
    primary_line: string;
    city: string;
    state: string;
    zip_code: string;
  };
  raw?: unknown;
}

// Only fully-deliverable results pass the gate; missing/incorrect-unit and
// undeliverable are skipped + surfaced for manual fix (per scoping doc B2).
const PASSING: ReadonlySet<Deliverability> = new Set([
  "deliverable",
  "deliverable_unnecessary_unit",
]);

export async function verifyUsAddress(a: {
  primary_line: string;
  city: string;
  state: string;
  zip_code: string;
}): Promise<VerifyResult> {
  const res = await lobFetch("/us_verifications", {
    method: "POST",
    body: JSON.stringify(a),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg = (body?.error as { message?: string })?.message ?? `HTTP ${res.status}`;
    throw new Error(`lob verify failed: ${msg}`);
  }
  const deliverability = (body.deliverability as Deliverability) ?? "undeliverable";
  const comps = body.components as Record<string, string> | undefined;
  return {
    deliverable: PASSING.has(deliverability),
    deliverability,
    corrected: comps
      ? {
          primary_line: (body.primary_line as string) ?? a.primary_line,
          city: comps.city ?? a.city,
          state: comps.state ?? a.state,
          zip_code: comps.zip_code ?? a.zip_code,
        }
      : undefined,
    raw: body,
  };
}

export interface CreatePostcardInput {
  to: LobAddress;
  from: LobAddress;
  // front/back accept a public asset URL (PNG/PDF) OR an inline HTML string.
  front: string;
  back: string;
  size: string; // '4x6' | '6x9' | '6x11'
  description?: string;
  // Merge variables for HTML designs (e.g. preview_url, business_name, qr_url).
  merge_variables?: Record<string, string>;
  // Idempotency: Lob dedupes creates sharing this key for 24h.
  idempotency_key?: string;
}

export interface CreatePostcardResult {
  id: string;
  url: string | null;
  expected_delivery_date: string | null;
  raw: unknown;
}

export async function createPostcard(input: CreatePostcardInput): Promise<CreatePostcardResult> {
  const { idempotency_key, merge_variables, ...rest } = input;
  const res = await lobFetch("/postcards", {
    method: "POST",
    headers: idempotency_key ? { "Idempotency-Key": idempotency_key } : {},
    body: JSON.stringify({
      ...rest,
      ...(merge_variables ? { merge_variables } : {}),
    }),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg = (body?.error as { message?: string })?.message ?? `HTTP ${res.status}`;
    throw new Error(`lob postcard create failed: ${msg}`);
  }
  return {
    id: body.id as string,
    url: (body.url as string) ?? null,
    expected_delivery_date: (body.expected_delivery_date as string) ?? null,
    raw: body,
  };
}

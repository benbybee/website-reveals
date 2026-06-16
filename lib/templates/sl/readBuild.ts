import { signPayload } from "@/lib/sitelaunchr";
import {
  SL_TEMPLATE_BUILD_URL,
  SL_TEMPLATE_SOURCE_ID,
  SL_TEMPLATE_API_KEY,
  SL_TEMPLATE_HMAC_SECRET,
} from "../config";

// SL's build-status read path (docs/integrations/sl-build-read-path.md):
//   GET {…/api/builds}/:build_id  → { build_id, external_id, status, site_url, error_message }
// Auth is the same per-source HMAC as dispatch, but a GET has NO body, so the
// signature base is `${timestamp}.` (empty body) — signPayload(ts, "", secret).
// This is the backstop WR uses to recover a dropped `succeeded` callback (ADR 0006).

export interface BuildState {
  build_id?: string;
  external_id?: string;
  status: string; // SL's authoritative build-status enum (superset of callback phases)
  site_url?: string | null;
  error_message?: string | null;
}

export interface ReadBuildResult {
  ok: boolean;
  status?: number; // HTTP status
  build?: BuildState;
  error?: string;
}

export interface ReadContext {
  buildUrl?: string;
  apiKey?: string;
  hmacSecret?: string;
}

function readUrl(base: string, buildId: string): string {
  return `${base.replace(/\/+$/, "")}/${encodeURIComponent(buildId)}`;
}

/** GET a single build's current status + url from SL. Never throws. */
export async function readBuild(buildId: string, ctx: ReadContext = {}): Promise<ReadBuildResult> {
  const base = ctx.buildUrl ?? SL_TEMPLATE_BUILD_URL();
  const apiKey = ctx.apiKey ?? SL_TEMPLATE_API_KEY();
  const secret = ctx.hmacSecret ?? SL_TEMPLATE_HMAC_SECRET();
  if (!base || !apiKey || !secret) return { ok: false, error: "missing_config" };

  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = signPayload(timestamp, "", secret); // empty-body GET: HMAC(`${ts}.`)
  try {
    const res = await fetch(readUrl(base, buildId), {
      method: "GET",
      headers: {
        "x-source-id": SL_TEMPLATE_SOURCE_ID,
        "x-api-key": apiKey,
        "x-timestamp": timestamp,
        "x-signature": signature,
      },
    });
    if (!(res.status >= 200 && res.status < 300)) {
      return { ok: false, status: res.status, error: `http_${res.status}` };
    }
    const build = (await res.json()) as BuildState;
    return { ok: true, status: res.status, build };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export type ReconcileAction =
  | { kind: "live"; preview_url: string }
  | { kind: "build_failed"; error: string }
  | { kind: "wait" };

// Terminal-failure statuses for a wr-template (pages_preview) build, per SL.
const TERMINAL_FAIL = new Set(["failed", "canceled", "cancelled", "kura_push_failed"]);

/**
 * Decide what to do with a build's read state. Per SL's contract: a wr-template
 * build rests at `succeeded` carrying `site_url` (no Kura/live phase). Reconcile
 * on STATUS, not on url presence alone — but never flip to live without a url.
 */
export function reconcileAction(build: BuildState): ReconcileAction {
  const url = (build.site_url ?? "").trim();
  if (build.status === "succeeded" && url) return { kind: "live", preview_url: url };
  if (TERMINAL_FAIL.has(build.status)) {
    return { kind: "build_failed", error: String(build.error_message || build.status).slice(0, 500) };
  }
  return { kind: "wait" };
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { signPayload } from "@/lib/sitelaunchr";
import {
  SL_TEMPLATE_TRANSPORT,
  SL_TEMPLATE_BUILD_URL,
  SL_TEMPLATE_SOURCE_ID,
  SL_TEMPLATE_API_KEY,
  SL_TEMPLATE_HMAC_SECRET,
} from "../config";
import type { BuildPayload } from "./toBuildPayload";

export interface BuildResult {
  external_id: string;
  ok: boolean;
  status?: number;
  build_id?: string;
  duplicate?: boolean;
  error?: string;
}

export interface PushResult {
  transport: "post" | "table";
  results: BuildResult[];
}

export interface PushContext {
  transport?: "post" | "table";
  // post transport
  buildUrl?: string;
  apiKey?: string;
  hmacSecret?: string;
  maxRetries?: number;
  // table transport
  db?: SupabaseClient;
  batchRowId?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * POST one build to SL's /api/builds as the `wr-template` source, using the same
 * HMAC scheme as the `wr` source (x-api-key + signed body) but wr-template's own
 * credentials. Honors 429 retry-after up to `maxRetries`. Per-build failures are
 * isolated (returned, not thrown) so one bad prospect doesn't abort the batch.
 */
async function postBuild(
  url: string,
  payload: BuildPayload,
  apiKey: string,
  secret: string,
  maxRetries: number,
): Promise<BuildResult> {
  // Serialize ONCE — the signed bytes must match the sent bytes exactly.
  const rawBody = JSON.stringify(payload);

  for (let attempt = 0; ; attempt++) {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = signPayload(timestamp, rawBody, secret);
    try {
      const res = await fetch(url, {
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

      // Respect the per-source rate limit: 429 + retry-after (seconds).
      if (res.status === 429 && attempt < maxRetries) {
        const parsed = Number(res.headers.get("retry-after"));
        const retryAfter = Number.isFinite(parsed) && parsed >= 0 ? parsed : 2;
        await sleep(retryAfter * 1000);
        continue;
      }

      const ok = res.status >= 200 && res.status < 300;
      let parsed: Record<string, unknown> = {};
      try {
        parsed = (await res.json()) as Record<string, unknown>;
      } catch {
        /* non-JSON body */
      }
      return {
        external_id: payload.external_id,
        ok,
        status: res.status,
        build_id: parsed.build_id as string | undefined,
        duplicate: parsed.duplicate as boolean | undefined,
        error: ok ? undefined : ((parsed.error as string) || `http_${res.status}`),
      };
    } catch (err) {
      return {
        external_id: payload.external_id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

/**
 * Deliver a campaign's builds to SL per the configured transport.
 *  - `post`  → one HMAC-signed POST per build to /api/builds; failures isolated.
 *  - `table` → persist the full payload set to the tpl_sl_batches row SL reads.
 *              Default/dry-run-safe path until SL creds are provisioned.
 */
export async function pushBuilds(builds: BuildPayload[], ctx: PushContext = {}): Promise<PushResult> {
  const transport = ctx.transport ?? SL_TEMPLATE_TRANSPORT();

  if (transport === "table") {
    if (!ctx.db || !ctx.batchRowId) throw new Error("table transport requires db + batchRowId");
    const { error } = await ctx.db
      .from("tpl_sl_batches")
      .update({ sl_response: { builds }, transport: "table", status: "delivered" })
      .eq("id", ctx.batchRowId);
    if (error) throw new Error(`table transport write failed: ${error.message}`);
    return { transport, results: builds.map((b) => ({ external_id: b.external_id, ok: true })) };
  }

  // post transport
  const url = ctx.buildUrl ?? SL_TEMPLATE_BUILD_URL();
  const apiKey = ctx.apiKey ?? SL_TEMPLATE_API_KEY();
  const secret = ctx.hmacSecret ?? SL_TEMPLATE_HMAC_SECRET();
  if (!url) throw new Error("post transport requires SL_TEMPLATE_BUILD_URL");
  if (!apiKey) throw new Error("post transport requires SL_TEMPLATE_API_KEY");
  if (!secret) throw new Error("post transport requires SL_TEMPLATE_HMAC_SECRET");

  const maxRetries = ctx.maxRetries ?? 3;
  const results: BuildResult[] = [];
  for (const build of builds) {
    results.push(await postBuild(url, build, apiKey, secret, maxRetries));
  }
  return { transport, results };
}

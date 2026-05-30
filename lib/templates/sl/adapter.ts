import type { SupabaseClient } from "@supabase/supabase-js";
import { signPayload } from "@/lib/sitelaunchr";
import { SL_TEMPLATE_TRANSPORT, SL_TEMPLATE_BATCH_URL } from "../config";
import type { BatchChunk } from "./chunk";

export interface ChunkResult {
  chunk_index: number;
  ok: boolean;
  status?: number;
  error?: string;
}

export interface PushResult {
  transport: "post" | "table";
  results: ChunkResult[];
}

export interface PushContext {
  transport?: "post" | "table";
  // post transport
  batchUrl?: string;
  hmacSecret?: string;
  // table transport
  db?: SupabaseClient;
  batchRowId?: string;
}

/** Build the exact wire payload for a chunk — identical across transports. */
function chunkPayload<T>(chunk: BatchChunk<T>) {
  return {
    campaign_id: chunk.campaign_id,
    batch_id: chunk.batch_id,
    chunk_index: chunk.chunk_index,
    chunk_total: chunk.chunk_total,
    records: chunk.records,
  };
}

/**
 * Dispatch a chunked batch to SL per the configured transport.
 *  - `post`  → HMAC-signed POST per chunk; per-chunk failures isolated/retryable.
 *  - `table` → persist the full artifact to a shared store (tpl_sl_batches row)
 *              SL reads. This is the default/dry-run-safe path until SL confirms
 *              the POST endpoint + credentials.
 */
export async function pushBatch<T>(chunks: BatchChunk<T>[], ctx: PushContext = {}): Promise<PushResult> {
  const transport = ctx.transport ?? SL_TEMPLATE_TRANSPORT();

  if (transport === "table") {
    if (!ctx.db || !ctx.batchRowId) throw new Error("table transport requires db + batchRowId");
    const artifact = { chunks: chunks.map(chunkPayload) };
    const { error } = await ctx.db
      .from("tpl_sl_batches")
      .update({ sl_response: artifact, transport: "table", status: "delivered" })
      .eq("id", ctx.batchRowId);
    if (error) throw new Error(`table transport write failed: ${error.message}`);
    return { transport, results: chunks.map((c) => ({ chunk_index: c.chunk_index, ok: true })) };
  }

  // post transport
  const url = ctx.batchUrl ?? SL_TEMPLATE_BATCH_URL();
  const secret = ctx.hmacSecret ?? (process.env.SITELAUNCHR_HMAC_SECRET || "").trim();
  if (!url) throw new Error("post transport requires SL_TEMPLATE_BATCH_URL");
  if (!secret) throw new Error("post transport requires SITELAUNCHR_HMAC_SECRET");

  const results: ChunkResult[] = [];
  for (const chunk of chunks) {
    const rawBody = JSON.stringify(chunkPayload(chunk));
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = signPayload(timestamp, rawBody, secret);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-source-id": "wr-tpl",
          "x-timestamp": timestamp,
          "x-signature": signature,
        },
        body: rawBody,
      });
      const ok = res.status >= 200 && res.status < 300;
      results.push({ chunk_index: chunk.chunk_index, ok, status: res.status });
    } catch (err) {
      results.push({
        chunk_index: chunk.chunk_index,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { transport, results };
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { CanonicalRecord } from "../types";
import { toPrepBrief, type PrepBrief } from "./toPrepBrief";
import { chunkBatch, type BatchChunk } from "./chunk";
import { pushBatch, type PushResult } from "./adapter";

/** Map canonical records → prep.brief and chunk them for delivery. */
export function buildChunks(
  records: CanonicalRecord[],
  campaignId: string,
  batchId: string,
  size = 500,
): BatchChunk<PrepBrief>[] {
  return chunkBatch(records.map(toPrepBrief), campaignId, batchId, size);
}

export interface AssembleResult {
  batchId: string;
  batchRowId: string;
  recordCount: number;
  chunkCount: number;
  dryRun: boolean;
  push?: PushResult;
}

export interface AssembleOptions {
  dryRun?: boolean;
  batchId?: string;
  chunkSize?: number;
  transport?: "post" | "table";
}

/**
 * Load a campaign's `qualified` prospects, assemble the chunked prep.brief
 * artifact, create a tpl_sl_batches row, and either dry-run (validate + persist,
 * no send) or dispatch via the transport adapter.
 */
export async function assembleAndPush(
  db: SupabaseClient,
  campaignId: string,
  opts: AssembleOptions = {},
): Promise<AssembleResult> {
  const { dryRun = false, chunkSize = 500 } = opts;
  const batchId = opts.batchId ?? `tpl-${campaignId}-${Date.now()}`;

  const { data, error } = await db
    .from("tpl_prospects")
    .select("record")
    .eq("campaign_id", campaignId)
    .eq("stage", "qualified");
  if (error) throw new Error(`failed loading qualified prospects: ${error.message}`);

  const records = ((data ?? []) as { record: CanonicalRecord }[]).map((r) => r.record);
  const chunks = buildChunks(records, campaignId, batchId, chunkSize);

  const { data: batchRow, error: insErr } = await db
    .from("tpl_sl_batches")
    .insert({
      campaign_id: campaignId,
      batch_id: batchId,
      chunk_count: chunks.length,
      record_count: records.length,
      transport: opts.transport ?? null,
      status: dryRun ? "dry_run" : "pending",
    })
    .select("id")
    .single();
  if (insErr) throw new Error(`failed creating batch row: ${insErr.message}`);
  const batchRowId = (batchRow as { id: string }).id;

  const base: AssembleResult = {
    batchId,
    batchRowId,
    recordCount: records.length,
    chunkCount: chunks.length,
    dryRun,
  };

  if (dryRun) return base;

  const push = await pushBatch(chunks, { transport: opts.transport, db, batchRowId });
  return { ...base, push };
}

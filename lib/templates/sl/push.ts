import type { SupabaseClient } from "@supabase/supabase-js";
import type { CanonicalRecord } from "../types";
import { toBuildPayload, type BuildPayload } from "./toBuildPayload";
import { pushBuilds, type PushResult } from "./adapter";

/** Map a campaign's canonical records → SL per-build payloads. */
export function buildPayloads(records: CanonicalRecord[]): BuildPayload[] {
  return records.map((r) => toBuildPayload(r));
}

export interface AssembleResult {
  batchId: string;
  batchRowId: string;
  recordCount: number;
  dryRun: boolean;
  push?: PushResult;
}

export interface AssembleOptions {
  dryRun?: boolean;
  batchId?: string;
  transport?: "post" | "table";
}

/**
 * Load a campaign's `qualified` prospects, map them to SL per-build payloads,
 * create a tpl_sl_batches row, and either dry-run (validate + persist, no send)
 * or dispatch one POST per build via the transport adapter.
 */
export async function assembleAndPush(
  db: SupabaseClient,
  campaignId: string,
  opts: AssembleOptions = {},
): Promise<AssembleResult> {
  const { dryRun = false } = opts;
  const batchId = opts.batchId ?? `tpl-${campaignId}-${Date.now()}`;

  const { data, error } = await db
    .from("tpl_prospects")
    .select("record")
    .eq("campaign_id", campaignId)
    .eq("stage", "qualified");
  if (error) throw new Error(`failed loading qualified prospects: ${error.message}`);

  const records = ((data ?? []) as { record: CanonicalRecord }[]).map((r) => r.record);
  const builds = buildPayloads(records);

  const { data: batchRow, error: insErr } = await db
    .from("tpl_sl_batches")
    .insert({
      campaign_id: campaignId,
      batch_id: batchId,
      // One POST per build now — chunk_count tracks the number of dispatches.
      chunk_count: builds.length,
      record_count: builds.length,
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
    recordCount: builds.length,
    dryRun,
  };

  if (dryRun) return base;

  const push = await pushBuilds(builds, { transport: opts.transport, db, batchRowId });
  return { ...base, push };
}

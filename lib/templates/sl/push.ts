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
  /**
   * When set, dispatch exactly these prospects (by tpl_prospects.id) regardless
   * of stage — the operator selected them in the CRM. When omitted, falls back
   * to the campaign-wide "all qualified" behavior.
   */
  prospectIds?: string[];
}

/**
 * Map prospects → SL per-build payloads, create a tpl_sl_batches row, and either
 * dry-run (validate + persist, no send) or dispatch one POST per build via the
 * transport adapter. Targets the explicit `sourceIds` if given, else every
 * `qualified` prospect in the campaign.
 */
export async function assembleAndPush(
  db: SupabaseClient,
  campaignId: string,
  opts: AssembleOptions = {},
): Promise<AssembleResult> {
  const { dryRun = false } = opts;
  const batchId = opts.batchId ?? `tpl-${campaignId}-${Date.now()}`;

  let q = db.from("tpl_prospects").select("record").eq("campaign_id", campaignId);
  q = opts.prospectIds && opts.prospectIds.length > 0
    ? q.in("id", opts.prospectIds)
    : q.eq("stage", "qualified");
  const { data, error } = await q;
  if (error) throw new Error(`failed loading prospects to push: ${error.message}`);

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

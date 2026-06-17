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
  /**
   * Set only when `defer` was requested for the `post` transport: the built
   * payloads the caller must dispatch itself (after responding to the client).
   * Lets the route run the slow per-build SL POST loop via next/server after()
   * so the client isn't blocked on it.
   */
  deferredBuilds?: BuildPayload[];
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
  /**
   * Defer the slow `post`-transport SL loop: build payloads + persist the batch
   * row, then RETURN them (deferredBuilds) instead of awaiting pushBuilds, so the
   * caller can dispatch after responding. No-op for the `table` transport (it's a
   * single fast write) and for dry runs.
   */
  defer?: boolean;
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

  // Suppressed leads are removed from the working list and must never build,
  // even if an explicit prospectId list somehow includes one.
  let q = db.from("tpl_prospects").select("record").eq("campaign_id", campaignId).is("suppressed_at", null);
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

  // Deferred post-transport dispatch: hand the payloads back so the route can run
  // the slow per-build SL POST loop AFTER responding (next/server after()),
  // instead of blocking the client on it. The `table` transport is a single fast
  // write, so it dispatches inline as before.
  if (opts.defer && opts.transport === "post") {
    return { ...base, deferredBuilds: builds };
  }

  const push = await pushBuilds(builds, { transport: opts.transport, db, batchRowId });
  return { ...base, push };
}

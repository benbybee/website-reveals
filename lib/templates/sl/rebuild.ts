import type { SupabaseClient } from "@supabase/supabase-js";
import type { CanonicalRecord } from "../types";
import { toBuildPayload, validateBuildPayload } from "./toBuildPayload";
import { pushBuilds, type PushResult } from "./adapter";

export interface RebuildResult {
  recordCount: number;
  skipped: { id: string; reason: string }[];
  dryRun: boolean;
  push?: PushResult;
}

/**
 * Re-arm one or more prospects' SL builds in place (retry: true), keyed by
 * tpl_prospects.id. Unlike assembleAndPush this is campaign-agnostic and creates
 * NO batch row — it is a targeted re-dispatch of existing builds (typically
 * `build_failed` rows from the Builds page), not a fresh intake.
 *
 * The retry path forces the `post` transport: re-arming a failed build is an SL
 * POST with `retry: true`; the `table` transport has no equivalent. SL dedups on
 * external_id (== source_id) and resets the SAME build_id, so this is safe to
 * fire repeatedly.
 */
export async function rebuildProspects(
  db: SupabaseClient,
  prospectIds: string[],
  opts: { dryRun?: boolean } = {},
): Promise<RebuildResult> {
  const dryRun = opts.dryRun === true;
  if (!prospectIds.length) return { recordCount: 0, skipped: [], dryRun };

  const { data, error } = await db
    .from("tpl_prospects")
    .select("id, record")
    .in("id", prospectIds);
  if (error) throw new Error(`failed loading prospects to rebuild: ${error.message}`);

  const skipped: { id: string; reason: string }[] = [];
  const payloads = [];
  for (const row of (data ?? []) as { id: string; record: CanonicalRecord }[]) {
    const payload = toBuildPayload(row.record);
    const valid = validateBuildPayload(payload);
    if (!valid.ok) {
      skipped.push({ id: row.id, reason: `missing ${valid.missing.join(", ")}` });
      continue;
    }
    payloads.push(payload);
  }

  const base: RebuildResult = { recordCount: payloads.length, skipped, dryRun };
  if (dryRun || payloads.length === 0) return base;

  const push = await pushBuilds(payloads, { transport: "post", retry: true });
  return { ...base, push };
}

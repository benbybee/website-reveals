import type { SupabaseClient } from "@supabase/supabase-js";
import { APIFY_TOKEN } from "../config";
import { estimateUsd } from "./costs";

const APIFY_BASE = "https://api.apify.com/v2";

export interface ActorRunResult {
  items: unknown[];
  runId: string | null;
}

/**
 * Run an Apify actor synchronously and return both its dataset items and the
 * run id. We use `run-sync` (not `run-sync-get-dataset-items`) precisely because
 * the latter returns ONLY the items array — no run id — so we'd have no way to
 * look up the real billed cost. `run-sync` returns the full run object (id,
 * defaultDatasetId, usageTotalUsd), and we then fetch the items from that
 * dataset. Two calls, but it gives us an authoritative run id with no reliance
 * on an undocumented header and no "last run" race under concurrent locations.
 *
 * Actor ids use the `owner/name` form here, converted to Apify's `owner~name`.
 */
export async function runActor(actorId: string, input: unknown): Promise<ActorRunResult> {
  const token = APIFY_TOKEN();
  if (!token) throw new Error("APIFY_TOKEN is not configured");
  const actorPath = actorId.replace("/", "~");
  const runUrl = `${APIFY_BASE}/acts/${actorPath}/run-sync?token=${encodeURIComponent(token)}`;

  const runRes = await fetch(runUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });

  const runText = await runRes.text();
  if (runRes.status < 200 || runRes.status >= 300) {
    throw new Error(`Apify actor ${actorId} failed: ${runRes.status} ${runText.slice(0, 300)}`);
  }

  let run: { id?: string; defaultDatasetId?: string };
  try {
    const parsed = runText ? JSON.parse(runText) : {};
    run = (parsed as { data?: typeof run }).data ?? {};
  } catch {
    throw new Error(`Apify actor ${actorId} returned non-JSON run body`);
  }

  const datasetId = run.defaultDatasetId;
  let items: unknown[] = [];
  if (datasetId) {
    const itemsUrl = `${APIFY_BASE}/datasets/${datasetId}/items?token=${encodeURIComponent(token)}&format=json`;
    const itemsRes = await fetch(itemsUrl);
    if (itemsRes.status < 200 || itemsRes.status >= 300) {
      const t = await itemsRes.text().catch(() => "");
      throw new Error(`Apify dataset ${datasetId} fetch failed: ${itemsRes.status} ${t.slice(0, 200)}`);
    }
    try {
      const parsed = await itemsRes.json();
      items = Array.isArray(parsed) ? parsed : [];
    } catch {
      throw new Error(`Apify dataset ${datasetId} returned non-JSON body`);
    }
  }

  return { items, runId: run.id ?? null };
}

/**
 * Fetch the REAL billed cost of a finished Apify run. The run object exposes
 * `data.usageTotalUsd` — the actual dollars Apify charged for that run (compute
 * units + dataset writes + proxy, etc.). This is authoritative; the per-unit
 * estimate in costs.ts is only a fallback for when we have no runId or the
 * lookup fails. Returns null on any failure so callers degrade to the estimate.
 */
export async function fetchRunUsageUsd(runId: string): Promise<number | null> {
  const token = APIFY_TOKEN();
  if (!token || !runId) return null;
  try {
    const url = `${APIFY_BASE}/actor-runs/${encodeURIComponent(runId)}?token=${encodeURIComponent(token)}`;
    const res = await fetch(url);
    if (res.status < 200 || res.status >= 300) return null;
    const body = (await res.json()) as { data?: { usageTotalUsd?: number } };
    const usd = body.data?.usageTotalUsd;
    return typeof usd === "number" && Number.isFinite(usd) ? usd : null;
  } catch {
    return null;
  }
}

export interface CostInput {
  campaignId: string;
  stage: "discover" | "audit" | "enrich" | "backfill";
  actor: string;
  units: number;
  runId?: string | null;
}

/**
 * Append a tpl_cost_events row using the REAL billed cost when a runId is
 * available (queried from Apify), falling back to the per-unit estimate only
 * when the real lookup is unavailable.
 */
export async function recordCostFromRun(db: SupabaseClient, input: CostInput): Promise<void> {
  const real = input.runId ? await fetchRunUsageUsd(input.runId) : null;
  const usd = real ?? estimateUsd(input.actor, input.units);
  const { error } = await db.from("tpl_cost_events").insert({
    campaign_id: input.campaignId,
    stage: input.stage,
    actor: input.actor,
    units: input.units,
    usd,
    run_id: input.runId ?? null,
  });
  if (error) throw new Error(`Failed to record cost event: ${error.message}`);
}

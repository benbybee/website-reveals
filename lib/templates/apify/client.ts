import type { SupabaseClient } from "@supabase/supabase-js";
import { APIFY_TOKEN } from "../config";
import { estimateUsd } from "./costs";

const APIFY_BASE = "https://api.apify.com/v2";

export interface ActorRunResult {
  items: unknown[];
  runId: string | null;
}

/**
 * Thin wrapper over Apify's run-sync-get-dataset-items REST endpoint. Runs an
 * actor synchronously and returns the produced dataset items. Actor ids use the
 * `owner/name` form here and are converted to Apify's `owner~name` URL form.
 *
 * NOTE: the exact run-stats shape is confirmed during the fixture-capture spike
 * (Task 3.2). Cost is modeled per-result via costs.ts until then.
 */
export async function runActor(actorId: string, input: unknown): Promise<ActorRunResult> {
  const token = APIFY_TOKEN();
  if (!token) throw new Error("APIFY_TOKEN is not configured");
  const actorPath = actorId.replace("/", "~");
  const url = `${APIFY_BASE}/acts/${actorPath}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });

  const text = await res.text();
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Apify actor ${actorId} failed: ${res.status} ${text.slice(0, 300)}`);
  }

  let items: unknown[] = [];
  try {
    const parsed = text ? JSON.parse(text) : [];
    items = Array.isArray(parsed) ? parsed : [];
  } catch {
    throw new Error(`Apify actor ${actorId} returned non-JSON body`);
  }

  return { items, runId: res.headers.get("x-apify-run-id") };
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

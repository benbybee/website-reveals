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

export interface CostInput {
  campaignId: string;
  stage: "discover" | "audit" | "enrich" | "backfill";
  actor: string;
  units: number;
  runId?: string | null;
}

/**
 * Compute USD from units x per-actor rate and append a tpl_cost_events row.
 */
export async function recordCostFromRun(db: SupabaseClient, input: CostInput): Promise<void> {
  const usd = estimateUsd(input.actor, input.units);
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

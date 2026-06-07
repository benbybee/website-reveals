import type { SupabaseClient } from "@supabase/supabase-js";
import { APIFY_TOKEN } from "../config";
import { estimateUsd } from "./costs";

const APIFY_BASE = "https://api.apify.com/v2";
// Apify caps the waitForFinish blocking window at 60s; we re-poll for longer runs.
const WAIT_FOR_FINISH_S = 60;
// Overall ceiling for a single actor run before we give up (Places/FB are short).
const RUN_TIMEOUT_MS = 5 * 60 * 1000;
const TERMINAL_STATUSES = new Set(["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT", "TIMED_OUT"]);

export interface ActorRunResult {
  items: unknown[];
  runId: string | null;
}

interface ApifyRun {
  id?: string;
  status?: string;
  defaultDatasetId?: string;
}

function parseRun(text: string, actorId: string): ApifyRun {
  try {
    const parsed = text ? JSON.parse(text) : {};
    return ((parsed as { data?: ApifyRun }).data ?? {}) as ApifyRun;
  } catch {
    throw new Error(`Apify actor ${actorId} returned a non-JSON run body`);
  }
}

/**
 * Run an Apify actor and return both its dataset items and the run id. We start
 * the run ASYNC (`POST /acts/{id}/runs`) with `waitForFinish=60` rather than the
 * `run-sync*` endpoints: the sync endpoints return only the actor OUTPUT/items
 * with NO run id, so we'd have no way to look up the real billed cost. The async
 * run endpoint returns the full run object (id, status, defaultDatasetId,
 * usageTotalUsd); we block up to 60s, re-poll for anything longer, then fetch
 * items from the run's dataset. Authoritative run id, no undocumented header,
 * no "last run" race across concurrent campaigns.
 *
 * Actor ids use the `owner/name` form here, converted to Apify's `owner~name`.
 */
export async function runActor(actorId: string, input: unknown): Promise<ActorRunResult> {
  const token = APIFY_TOKEN();
  if (!token) throw new Error("APIFY_TOKEN is not configured");
  const actorPath = actorId.replace("/", "~");
  const tok = encodeURIComponent(token);

  const startUrl = `${APIFY_BASE}/acts/${actorPath}/runs?token=${tok}&waitForFinish=${WAIT_FOR_FINISH_S}`;
  const startRes = await fetch(startUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const startText = await startRes.text();
  if (startRes.status < 200 || startRes.status >= 300) {
    throw new Error(`Apify actor ${actorId} failed to start: ${startRes.status} ${startText.slice(0, 300)}`);
  }

  let run = parseRun(startText, actorId);
  if (!run.id) throw new Error(`Apify actor ${actorId} returned no run id`);

  const deadline = Date.now() + RUN_TIMEOUT_MS;
  while (!TERMINAL_STATUSES.has(run.status ?? "") && Date.now() < deadline) {
    const pollRes = await fetch(`${APIFY_BASE}/actor-runs/${run.id}?token=${tok}&waitForFinish=${WAIT_FOR_FINISH_S}`);
    const pollText = await pollRes.text();
    if (pollRes.status < 200 || pollRes.status >= 300) {
      throw new Error(`Apify run ${run.id} poll failed: ${pollRes.status} ${pollText.slice(0, 200)}`);
    }
    run = parseRun(pollText, actorId);
  }

  if (run.status !== "SUCCEEDED") {
    throw new Error(`Apify actor ${actorId} run ${run.id} ended ${run.status ?? "UNKNOWN (timed out waiting)"}`);
  }

  let items: unknown[] = [];
  if (run.defaultDatasetId) {
    const itemsRes = await fetch(`${APIFY_BASE}/datasets/${run.defaultDatasetId}/items?token=${tok}&format=json`);
    if (itemsRes.status < 200 || itemsRes.status >= 300) {
      const t = await itemsRes.text().catch(() => "");
      throw new Error(`Apify dataset ${run.defaultDatasetId} fetch failed: ${itemsRes.status} ${t.slice(0, 200)}`);
    }
    try {
      const parsed = await itemsRes.json();
      items = Array.isArray(parsed) ? parsed : [];
    } catch {
      throw new Error(`Apify dataset ${run.defaultDatasetId} returned a non-JSON body`);
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

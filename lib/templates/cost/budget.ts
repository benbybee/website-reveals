import type { SupabaseClient } from "@supabase/supabase-js";
import { REP_DAILY_BUDGET_USD } from "../config";

// Gap 5: a dollar estimate for one instant-preview build + a per-rep/day spend
// check, guarding the interactive rep flow against runaway cost. Real spend is
// still recorded in tpl_cost_events (stage/actor/units/usd); this only estimates
// and caps. The estimate is deliberately worst-case so the gate is conservative.

// Places details (~$0.017) + a free homepage HTML fetch + worst-case Firecrawl
// branding on deterministic miss (~$0.004). ponytail: flat estimate; refine
// against real Places+Firecrawl spend if the cap starts mis-firing.
export const estimateInstantPreviewUsd = () => 0.021;

/** Sum a rep's recorded USD spend since the given day-start ISO timestamp. */
export async function repSpentTodayUsd(
  db: SupabaseClient,
  repId: string,
  dayStartIso: string,
): Promise<number> {
  const { data } = await db
    .from("tpl_cost_events")
    .select("usd")
    .eq("rep_id", repId)
    .gte("created_at", dayStartIso);
  return ((data ?? []) as { usd: number | null }[]).reduce((s, r) => s + Number(r.usd ?? 0), 0);
}

/** True iff the rep's spent + one more build's estimate stays within the cap. */
export function withinRepBudget(spentUsd: number): boolean {
  return spentUsd + estimateInstantPreviewUsd() <= REP_DAILY_BUDGET_USD();
}

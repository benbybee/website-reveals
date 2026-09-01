import type { SupabaseClient } from "@supabase/supabase-js";
import {
  REP_DAILY_BUDGET_USD,
  REP_DAILY_BUILD_LIMIT,
  SL_TEMPLATE_BUILD_EST_USD,
} from "../config";

// Gap 5: two per-rep/day guards on the interactive rep flow — a build COUNT cap
// (the primary runaway guard) and a DOLLAR cap (cost-overrun backstop). Real
// spend is recorded in tpl_cost_events (stage/actor/units/usd, incl. a per-build
// SL 'build' estimate); these only estimate + cap. Estimates are worst-case.

// WR's own metered spend per build: Places details (~$0.017) + a free homepage
// fetch + worst-case Firecrawl branding on a deterministic miss (~$0.004).
const WR_METERED_USD = 0.021;

/** Estimated total cost of one instant-preview build: WR metered + SL build. */
export const estimateInstantPreviewUsd = () => WR_METERED_USD + SL_TEMPLATE_BUILD_EST_USD();

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

/**
 * Count the rep's builds since day-start. Each instant-preview build fires
 * exactly one Places details call, recorded as a `find` cost event — so counting
 * those per rep/day is the build count.
 */
export async function repBuildsToday(
  db: SupabaseClient,
  repId: string,
  dayStartIso: string,
): Promise<number> {
  const { count } = await db
    .from("tpl_cost_events")
    .select("id", { count: "exact", head: true })
    .eq("rep_id", repId)
    .eq("stage", "find")
    .gte("created_at", dayStartIso);
  return count ?? 0;
}

/** True iff the rep is still under the hard per-rep/day build-count cap. */
export function withinRepBuildLimit(buildsToday: number): boolean {
  return buildsToday < REP_DAILY_BUILD_LIMIT();
}

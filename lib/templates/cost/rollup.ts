import type { SupabaseClient } from "@supabase/supabase-js";

export interface CostRow {
  stage: string;
  usd: number | null;
}

export interface CostRollup {
  total: number;
  byStage: Record<string, number>;
  costPerQualified: number | null;
}

/** Pure rollup: total spend, per-stage breakdown, cost-per-qualified. */
export function rollupCost(rows: CostRow[], qualifiedCount: number): CostRollup {
  const byStage: Record<string, number> = {};
  let total = 0;
  for (const r of rows) {
    const usd = Number(r.usd ?? 0);
    total += usd;
    byStage[r.stage] = round2((byStage[r.stage] ?? 0) + usd);
  }
  total = round2(total);
  return {
    total,
    byStage,
    costPerQualified: qualifiedCount > 0 ? round2(total / qualifiedCount) : null,
  };
}

/** Load a campaign's cost ledger + qualified count and roll it up. */
export async function campaignCost(db: SupabaseClient, campaignId: string): Promise<CostRollup> {
  const { data: events } = await db
    .from("tpl_cost_events")
    .select("stage, usd")
    .eq("campaign_id", campaignId);
  const { data: campaign } = await db
    .from("tpl_campaigns")
    .select("qualified_count")
    .eq("id", campaignId)
    .single();
  return rollupCost((events ?? []) as CostRow[], campaign?.qualified_count ?? 0);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

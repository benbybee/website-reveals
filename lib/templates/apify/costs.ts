// Per-actor unit-cost constants (USD per result/unit). NOT secret — config.
// Tune these against real Apify run stats once fixtures are captured (Task 3.2).
export interface ActorCost {
  usdPerUnit: number; // USD per dataset item produced
}

export const ACTOR_COSTS: Record<string, ActorCost> = {
  "compass/crawler-google-places": { usdPerUnit: 0.007 },
  "accurate_pouch/tech-stack-detector": { usdPerUnit: 0.01 },
  "nexgendata/google-lighthouse-checker": { usdPerUnit: 0.02 },
};

const DEFAULT_COST: ActorCost = { usdPerUnit: 0.01 };

export function actorCost(actor: string): ActorCost {
  return ACTOR_COSTS[actor] ?? DEFAULT_COST;
}

export function estimateUsd(actor: string, units: number): number {
  return Math.round(actorCost(actor).usdPerUnit * units * 1e6) / 1e6;
}

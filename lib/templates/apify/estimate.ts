import { estimateUsd } from "./costs";

export interface CostEstimate {
  units: number;
  usd: number;
}

/**
 * Pure cost preview for "select N → ~$X" dialogs before spending Apify credits.
 */
export function estimate(actor: string, n: number): CostEstimate {
  const units = Math.max(0, Math.floor(n));
  return { units, usd: estimateUsd(actor, units) };
}

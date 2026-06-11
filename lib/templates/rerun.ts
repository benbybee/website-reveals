// Shared contract for re-running a campaign (the long-lived list). A campaign is
// re-run in one of three modes; the run API route translates a RerunConfig into
// discover/enrich task payloads. Kept in lib (not src/trigger) so the API route,
// the Trigger tasks, and the client modal all import the same source of truth.

export type RerunMode = "discover_new" | "enrich_existing" | "rescrape";

/**
 * Stages a prospect can occupy. Re-enrich can target any subset of these.
 * "enriching" is transient (a prospect only persists there when a run died
 * mid-flight) but is targetable so re-runs can sweep up crash orphans.
 */
export const PROSPECT_STAGES = ["scraped", "enriching", "incomplete", "qualified", "pushed"] as const;
export type ProspectStage = (typeof PROSPECT_STAGES)[number];

export interface RerunConfig {
  mode: RerunMode;
  /** enrich_existing: which prospect stages to reprocess. Default ["scraped"]. */
  stages?: string[];
  /** enrich_existing: include prospects that have no website. Default true. */
  includeNoSite?: boolean;
  /** rescrape: re-score refreshed prospects (resets their stage to scraped). */
  reEnrich?: boolean;
  /** Optional: bump the campaign's target_count before discovering (deeper crawl). */
  targetCount?: number;
}

export interface DiscoverPayload {
  campaignId: string;
  /** discover_new: skip source_ids already in the campaign (append-only). */
  excludeExisting?: boolean;
  /** rescrape: reset refreshed existing prospects to "scraped" so enrich reprocesses them. */
  reEnrich?: boolean;
}

export interface EnrichPayload {
  campaignId: string;
  stages?: string[];
  includeNoSite?: boolean;
  /** Keep each prospect's existing stage instead of writing qualified/incomplete. */
  preserveStage?: boolean;
}

/**
 * One tpl-enrich-batch child run: a small slice of a campaign's prospects.
 * The parent resolves the campaign/industry once and partitions the prospect
 * IDs, so children never re-derive selection state (no drift between what the
 * parent selected and what a child processes).
 */
export interface EnrichBatchPayload {
  campaignId: string;
  prospectIds: string[];
  /** Canonical SL industry slug, resolved by the parent. */
  industrySlug: string;
  /** The stage set the parent dispatched against — children skip prospects that moved. */
  stages: string[];
  preserveStage?: boolean;
}

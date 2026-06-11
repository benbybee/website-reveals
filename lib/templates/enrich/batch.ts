// Pure helpers for the fanned-out enrich stage: the tpl-enrich parent chunks
// prospect IDs into small batches, dispatches one tpl-enrich-batch child run
// per batch, and aggregates the child outputs. Kept in lib (not src/trigger)
// so the sizing/aggregation logic is unit-testable without the Trigger SDK.

/**
 * Prospects per child run. Sized so worst case stays well inside the child's
 * maxDuration of 3600s: per prospect the ceilings are 300s (Apify actor poll,
 * which is in-process compute) + 60s (Firecrawl) + 3x10s (asset HEAD checks),
 * so 5 x ~390s ~= 1950s even when a provider degradation pushes EVERY prospect
 * to its ceiling at once. Average is ~11s/prospect, ~1 min per batch.
 */
export const ENRICH_BATCH_SIZE = 5;

/**
 * How old a prospect's "enriching" stamp must be before a run treats it as a
 * crash orphan and re-processes it. Must exceed the child task's maxDuration
 * (3600s): a row flipped by a live child is always younger than that, so
 * anything older can only have been stranded by a dead run.
 */
export const ORPHAN_STALE_MS = 2 * 60 * 60 * 1000;

/**
 * Child payloads per batchTriggerAndWait call. The platform caps a single
 * batch call at 1,000 payloads (SDK >= 4.3.1); we slice well under it so one
 * call never trips the limit regardless of campaign size.
 */
export const BATCH_DISPATCH_LIMIT = 500;

/** What a tpl-enrich-batch child run reports back to the parent. */
export interface EnrichBatchOutput {
  qualified: number;
  incomplete: number;
  /** Prospects whose enrichment threw (logged, left for the next run). */
  failed: number;
  /** Prospects skipped because their stage moved outside the dispatched set. */
  skipped: number;
}

export interface BatchAggregate extends EnrichBatchOutput {
  /** Child runs that failed outright (no output to sum). */
  failedBatches: number;
}

/** Split items into consecutive chunks of at most `size`, preserving order. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (!Number.isInteger(size) || size < 1) {
    throw new RangeError(`chunk size must be a positive integer, got ${size}`);
  }
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/** Sum child outputs; a missing output (failed child run) counts as a failed batch. */
export function aggregateBatchOutputs(
  outputs: ReadonlyArray<EnrichBatchOutput | null | undefined>,
): BatchAggregate {
  const agg: BatchAggregate = { qualified: 0, incomplete: 0, failed: 0, skipped: 0, failedBatches: 0 };
  for (const o of outputs) {
    if (!o) {
      agg.failedBatches += 1;
      continue;
    }
    agg.qualified += o.qualified;
    agg.incomplete += o.incomplete;
    agg.failed += o.failed;
    agg.skipped += o.skipped;
  }
  return agg;
}

/**
 * Should a child process this prospect right now? Uses the row's CURRENT
 * stage (re-read just before processing, not the parent's select-time view):
 * - stage moved outside the dispatched set (a rep advanced it, or another run
 *   finished it) -> skip.
 * - stage is "enriching": only process if the stamp is stale (ORPHAN_STALE_MS)
 *   — a fresh stamp means another run's child is processing it RIGHT NOW, and
 *   double-processing burns real Apify/Firecrawl spend and races the writes.
 *   A missing stamp can't be dated, so it is treated as an orphan.
 */
export function shouldProcessProspect(input: {
  stage: string;
  updatedAt: string | null;
  stages: readonly string[];
  nowMs: number;
}): boolean {
  if (!input.stages.includes(input.stage)) return false;
  if (input.stage !== "enriching") return true;
  if (!input.updatedAt) return true;
  const stamped = Date.parse(input.updatedAt);
  if (Number.isNaN(stamped)) return true;
  return input.nowMs - stamped >= ORPHAN_STALE_MS;
}

/**
 * Decide the stage to persist after scoring a prospect. preserveStage keeps a
 * rep's pipeline position — EXCEPT "enriching", which is a transient marker
 * that only persists when a run died mid-prospect; preserving it would strand
 * the prospect forever, so a crash orphan always lands on its scored stage.
 */
export function resolveStage(input: {
  preserveStage: boolean;
  currentStage: string;
  missingCount: number;
}): string {
  const scored = input.missingCount === 0 ? "qualified" : "incomplete";
  if (!input.preserveStage) return scored;
  return input.currentStage === "enriching" ? scored : input.currentStage;
}

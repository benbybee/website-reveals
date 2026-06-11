import { describe, it, expect } from "vitest";
import {
  chunk,
  aggregateBatchOutputs,
  resolveStage,
  shouldProcessProspect,
  ENRICH_BATCH_SIZE,
  BATCH_DISPATCH_LIMIT,
  ORPHAN_STALE_MS,
} from "./batch";

describe("chunk", () => {
  it("splits with a remainder chunk at the end", () => {
    const out = chunk([1, 2, 3, 4, 5, 6, 7], 3);
    expect(out).toEqual([[1, 2, 3], [4, 5, 6], [7]]);
  });

  it("splits exactly when length is a multiple of size", () => {
    expect(chunk([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]]);
  });

  it("returns a single chunk when size exceeds length", () => {
    expect(chunk([1, 2], 10)).toEqual([[1, 2]]);
  });

  it("returns [] for an empty input", () => {
    expect(chunk([], 5)).toEqual([]);
  });

  it("throws on a non-positive size", () => {
    expect(() => chunk([1], 0)).toThrow();
    expect(() => chunk([1], -3)).toThrow();
  });

  it("covers every item exactly once at the real batch sizes", () => {
    const ids = Array.from({ length: 400 }, (_, i) => `id-${i}`);
    const batches = chunk(ids, ENRICH_BATCH_SIZE);
    expect(batches.flat()).toEqual(ids);
    const slices = chunk(batches, BATCH_DISPATCH_LIMIT);
    expect(slices.flat().flat()).toEqual(ids);
  });
});

describe("aggregateBatchOutputs", () => {
  it("sums counts across child outputs", () => {
    const agg = aggregateBatchOutputs([
      { qualified: 3, incomplete: 2, failed: 0, skipped: 0 },
      { qualified: 1, incomplete: 4, failed: 1, skipped: 2 },
    ]);
    expect(agg).toEqual({ qualified: 4, incomplete: 6, failed: 1, skipped: 2, failedBatches: 0 });
  });

  it("counts null/undefined outputs as failed batches without poisoning the sums", () => {
    const agg = aggregateBatchOutputs([
      { qualified: 2, incomplete: 0, failed: 0, skipped: 0 },
      null,
      undefined,
    ]);
    expect(agg).toEqual({ qualified: 2, incomplete: 0, failed: 0, skipped: 0, failedBatches: 2 });
  });

  it("returns zeros for an empty run set", () => {
    expect(aggregateBatchOutputs([])).toEqual({
      qualified: 0,
      incomplete: 0,
      failed: 0,
      skipped: 0,
      failedBatches: 0,
    });
  });
});

describe("shouldProcessProspect", () => {
  const now = Date.parse("2026-06-11T12:00:00.000Z");
  const fresh = new Date(now - 5 * 60 * 1000).toISOString(); // 5 min ago
  const stale = new Date(now - ORPHAN_STALE_MS - 1000).toISOString();

  it("processes a prospect whose stage is in the dispatched set", () => {
    expect(shouldProcessProspect({ stage: "scraped", updatedAt: fresh, stages: ["scraped"], nowMs: now })).toBe(true);
  });

  it("skips a prospect whose stage moved outside the dispatched set", () => {
    expect(shouldProcessProspect({ stage: "qualified", updatedAt: fresh, stages: ["scraped"], nowMs: now })).toBe(false);
    expect(shouldProcessProspect({ stage: "pushed", updatedAt: stale, stages: ["scraped", "enriching"], nowMs: now })).toBe(false);
  });

  it("skips a FRESH enriching row — another run's child is processing it right now", () => {
    expect(
      shouldProcessProspect({ stage: "enriching", updatedAt: fresh, stages: ["scraped", "enriching"], nowMs: now }),
    ).toBe(false);
  });

  it("processes a STALE enriching row — a crash orphan from a dead run", () => {
    expect(
      shouldProcessProspect({ stage: "enriching", updatedAt: stale, stages: ["scraped", "enriching"], nowMs: now }),
    ).toBe(true);
  });

  it("skips enriching rows entirely when the dispatched set does not include them", () => {
    expect(shouldProcessProspect({ stage: "enriching", updatedAt: stale, stages: ["qualified"], nowMs: now })).toBe(false);
  });

  it("treats an undatable stamp as an orphan rather than stranding it", () => {
    expect(
      shouldProcessProspect({ stage: "enriching", updatedAt: null, stages: ["scraped", "enriching"], nowMs: now }),
    ).toBe(true);
    expect(
      shouldProcessProspect({ stage: "enriching", updatedAt: "garbage", stages: ["scraped", "enriching"], nowMs: now }),
    ).toBe(true);
  });
});

describe("resolveStage", () => {
  it("scores to qualified when nothing is missing", () => {
    expect(resolveStage({ preserveStage: false, currentStage: "scraped", missingCount: 0 })).toBe("qualified");
  });

  it("scores to incomplete when fields are missing", () => {
    expect(resolveStage({ preserveStage: false, currentStage: "scraped", missingCount: 2 })).toBe("incomplete");
  });

  it("preserves a rep's pipeline position when preserveStage is set", () => {
    expect(resolveStage({ preserveStage: true, currentStage: "pushed", missingCount: 0 })).toBe("pushed");
    expect(resolveStage({ preserveStage: true, currentStage: "qualified", missingCount: 3 })).toBe("qualified");
  });

  it("never preserves the transient enriching stage — a crash orphan must land on a real stage", () => {
    expect(resolveStage({ preserveStage: true, currentStage: "enriching", missingCount: 0 })).toBe("qualified");
    expect(resolveStage({ preserveStage: true, currentStage: "enriching", missingCount: 1 })).toBe("incomplete");
  });
});

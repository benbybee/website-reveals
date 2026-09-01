import { describe, it, expect, afterEach } from "vitest";
import { estimateInstantPreviewUsd, repSpentTodayUsd, withinRepBudget } from "./budget";

afterEach(() => {
  delete process.env.REP_DAILY_BUDGET_USD;
});

// Chainable stand-in: from().select().eq().gte() resolves to { data }.
function mockDb(rows: { usd: number | null }[]) {
  const calls: { table: string; filters: Record<string, unknown> }[] = [];
  const db = {
    calls,
    from(table: string) {
      const rec = { table, filters: {} as Record<string, unknown> };
      calls.push(rec);
      const builder = {
        select() {
          return builder;
        },
        eq(col: string, val: unknown) {
          rec.filters[col] = val;
          return builder;
        },
        gte(col: string, val: unknown) {
          rec.filters[col] = val;
          return Promise.resolve({ data: rows, error: null });
        },
      };
      return builder;
    },
  };
  return db;
}

describe("estimateInstantPreviewUsd", () => {
  it("returns the fixed per-build estimate", () => {
    expect(estimateInstantPreviewUsd()).toBeCloseTo(0.021, 5);
  });
});

describe("repSpentTodayUsd", () => {
  it("sums usd for the rep since day start, tolerating null rows", async () => {
    const db = mockDb([{ usd: 0.017 }, { usd: 0.004 }, { usd: null }]);
    const total = await repSpentTodayUsd(db as never, "rep-1", "2026-09-01T00:00:00Z");
    expect(total).toBeCloseTo(0.021, 5);
    expect(db.calls[0].table).toBe("tpl_cost_events");
    expect(db.calls[0].filters.rep_id).toBe("rep-1");
    expect(db.calls[0].filters.created_at).toBe("2026-09-01T00:00:00Z");
  });

  it("returns 0 when the rep has no events", async () => {
    const db = mockDb([]);
    expect(await repSpentTodayUsd(db as never, "rep-1", "2026-09-01T00:00:00Z")).toBe(0);
  });
});

describe("withinRepBudget", () => {
  it("is true when spent + estimate is within the default $5 cap", () => {
    expect(withinRepBudget(4.9)).toBe(true); // 4.921 <= 5
  });
  it("is false when spent + estimate exceeds the cap", () => {
    expect(withinRepBudget(4.99)).toBe(false); // 5.011 > 5
  });
  it("respects a REP_DAILY_BUDGET_USD override", () => {
    process.env.REP_DAILY_BUDGET_USD = "1";
    expect(withinRepBudget(1)).toBe(false); // 1.021 > 1
    expect(withinRepBudget(0.9)).toBe(true); // 0.921 <= 1
  });
});

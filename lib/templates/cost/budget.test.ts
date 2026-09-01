import { describe, it, expect, afterEach } from "vitest";
import {
  estimateInstantPreviewUsd,
  repSpentTodayUsd,
  withinRepBudget,
  repBuildsToday,
  withinRepBuildLimit,
} from "./budget";

afterEach(() => {
  delete process.env.REP_DAILY_BUDGET_USD;
  delete process.env.REP_DAILY_BUILD_LIMIT;
  delete process.env.SL_TEMPLATE_BUILD_EST_USD;
});

// Recording stand-in: from().select().eq()…gte() resolves to { data, count }.
function mockDb(cfg: { rows?: { usd: number | null }[]; count?: number }) {
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
          return Promise.resolve({ data: cfg.rows ?? [], count: cfg.count ?? 0, error: null });
        },
      };
      return builder;
    },
  };
  return db;
}

describe("estimateInstantPreviewUsd", () => {
  it("is WR metered (~$0.021) + the SL build estimate ($0.03 default)", () => {
    expect(estimateInstantPreviewUsd()).toBeCloseTo(0.051, 5);
  });
  it("tracks the SL build estimate override", () => {
    process.env.SL_TEMPLATE_BUILD_EST_USD = "6";
    expect(estimateInstantPreviewUsd()).toBeCloseTo(6.021, 5);
  });
});

describe("repSpentTodayUsd", () => {
  it("sums usd for the rep since day start, tolerating null rows", async () => {
    const db = mockDb({ rows: [{ usd: 4.0 }, { usd: 0.017 }, { usd: null }] });
    const total = await repSpentTodayUsd(db as never, "rep-1", "2026-09-01T00:00:00Z");
    expect(total).toBeCloseTo(4.017, 5);
    expect(db.calls[0].table).toBe("tpl_cost_events");
    expect(db.calls[0].filters.rep_id).toBe("rep-1");
    expect(db.calls[0].filters.created_at).toBe("2026-09-01T00:00:00Z");
  });
});

describe("withinRepBudget", () => {
  it("is true when spent + estimate is within the default $10 cap", () => {
    expect(withinRepBudget(9.9)).toBe(true); // 9.951 <= 10
  });
  it("is false when spent + estimate exceeds the cap", () => {
    expect(withinRepBudget(9.95)).toBe(false); // 10.001 > 10
  });
  it("respects a REP_DAILY_BUDGET_USD override", () => {
    process.env.REP_DAILY_BUDGET_USD = "8";
    expect(withinRepBudget(7)).toBe(true); // 7.051 <= 8
    expect(withinRepBudget(8)).toBe(false); // 8.051 > 8
  });
});

describe("repBuildsToday", () => {
  it("counts the rep's 'find' cost events since day start", async () => {
    const db = mockDb({ count: 7 });
    const n = await repBuildsToday(db as never, "rep-1", "2026-09-01T00:00:00Z");
    expect(n).toBe(7);
    expect(db.calls[0].table).toBe("tpl_cost_events");
    expect(db.calls[0].filters.rep_id).toBe("rep-1");
    expect(db.calls[0].filters.stage).toBe("find");
    expect(db.calls[0].filters.created_at).toBe("2026-09-01T00:00:00Z");
  });
});

describe("withinRepBuildLimit", () => {
  it("is true below the default 30/day cap and false at/above it", () => {
    expect(withinRepBuildLimit(29)).toBe(true);
    expect(withinRepBuildLimit(30)).toBe(false);
    expect(withinRepBuildLimit(31)).toBe(false);
  });
  it("respects a REP_DAILY_BUILD_LIMIT override", () => {
    process.env.REP_DAILY_BUILD_LIMIT = "5";
    expect(withinRepBuildLimit(4)).toBe(true);
    expect(withinRepBuildLimit(5)).toBe(false);
  });
});

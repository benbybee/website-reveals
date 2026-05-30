import { describe, it, expect } from "vitest";
import { rollupCost } from "./rollup";

describe("rollupCost", () => {
  it("totals usd by stage and computes cost per qualified", () => {
    const rows = [
      { stage: "discover", usd: 1.0 },
      { stage: "discover", usd: 0.5 },
      { stage: "enrich", usd: 2.0 },
      { stage: "audit", usd: 3.0 },
    ];
    const out = rollupCost(rows, 5);
    expect(out.total).toBeCloseTo(6.5, 5);
    expect(out.byStage.discover).toBeCloseTo(1.5, 5);
    expect(out.byStage.enrich).toBeCloseTo(2.0, 5);
    expect(out.byStage.audit).toBeCloseTo(3.0, 5);
    expect(out.costPerQualified).toBeCloseTo(1.3, 5); // 6.5 / 5
  });

  it("reports null cost-per-qualified when none qualified", () => {
    const out = rollupCost([{ stage: "discover", usd: 4 }], 0);
    expect(out.total).toBe(4);
    expect(out.costPerQualified).toBeNull();
  });

  it("handles an empty ledger", () => {
    const out = rollupCost([], 0);
    expect(out.total).toBe(0);
    expect(out.byStage).toEqual({});
    expect(out.costPerQualified).toBeNull();
  });
});

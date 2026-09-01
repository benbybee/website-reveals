import { describe, it, expect } from "vitest";
import { resolveBuildCostUsd } from "./buildCost";

describe("resolveBuildCostUsd", () => {
  it("returns cost_usd verbatim when present (preferred)", () => {
    expect(resolveBuildCostUsd({ cost_usd: 0.0123 })).toBe(0.0123);
  });

  it("accepts a zero cost (e.g. a failed build with no fill spend)", () => {
    expect(resolveBuildCostUsd({ cost_usd: 0 })).toBe(0);
  });

  it("prices token usage when cost_usd is absent", () => {
    const cost = resolveBuildCostUsd({
      usage: { model: "claude-haiku-4-5", input_tokens: 5300, output_tokens: 3700 },
    });
    expect(cost).not.toBeNull();
    expect(cost!).toBeGreaterThan(0);
  });

  it("tolerates SL's cache_*_tokens spelling", () => {
    const cost = resolveBuildCostUsd({
      usage: {
        model: "claude-haiku-4-5",
        input_tokens: 1000,
        output_tokens: 1000,
        cache_read_tokens: 2000,
        cache_creation_tokens: 500,
      },
    });
    expect(cost).not.toBeNull();
    expect(cost!).toBeGreaterThan(0);
  });

  it("prefers cost_usd over usage when both are present", () => {
    const cost = resolveBuildCostUsd({
      cost_usd: 0.02,
      usage: { model: "claude-opus-4-7", input_tokens: 1_000_000, output_tokens: 1_000_000 },
    });
    expect(cost).toBe(0.02);
  });

  it("returns null when SL sent no cost fields", () => {
    expect(resolveBuildCostUsd({})).toBeNull();
    expect(resolveBuildCostUsd({ usage: { model: "x" } })).toBeNull();
  });
});

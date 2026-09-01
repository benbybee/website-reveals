import { describe, it, expect } from "vitest";
import { defaultServices } from "./defaultServices";

describe("defaultServices", () => {
  it.each(["hvac", "garage-door", "roofing", "landscaping", "pool-service", "fencing"])(
    "returns a curated 3+ service list for %s",
    (slug) => {
      const svcs = defaultServices(slug);
      expect(svcs.length).toBeGreaterThanOrEqual(3);
      expect(svcs.every((s) => typeof s.name === "string" && s.name.trim().length > 0)).toBe(true);
    },
  );

  it("returns [] for an unknown slug", () => {
    expect(defaultServices("underwater-basket-weaving")).toEqual([]);
  });
});

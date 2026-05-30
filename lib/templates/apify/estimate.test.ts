import { describe, it, expect } from "vitest";
import { estimate } from "./estimate";

describe("estimate", () => {
  it("computes units + usd for a known actor", () => {
    expect(estimate("compass/crawler-google-places", 100)).toEqual({ units: 100, usd: 0.7 });
  });
  it("uses the default rate for an unknown actor", () => {
    expect(estimate("unknown/actor", 50)).toEqual({ units: 50, usd: 0.5 });
  });
  it("returns zero for zero selection", () => {
    expect(estimate("compass/crawler-google-places", 0)).toEqual({ units: 0, usd: 0 });
  });
});

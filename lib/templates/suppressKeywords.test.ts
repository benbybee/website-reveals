import { describe, it, expect } from "vitest";
import { parseKeywords, buildNameOrFilter } from "./suppressKeywords";

describe("parseKeywords", () => {
  it("splits comma-separated input, trims, drops empties", () => {
    expect(parseKeywords("plumbing, electrical , mechanical")).toEqual(["plumbing", "electrical", "mechanical"]);
    expect(parseKeywords("plumbing,, ,electrical")).toEqual(["plumbing", "electrical"]);
  });

  it("accepts an already-split array", () => {
    expect(parseKeywords(["plumbing", " electrical "])).toEqual(["plumbing", "electrical"]);
  });

  it("strips PostgREST/ilike special chars so tokens match literally", () => {
    // (),*,\,%,_ would break .or() parsing or act as wildcards — neutralized to spaces.
    expect(parseKeywords("a*b, c(d), 50%off")).toEqual(["a b", "c d", "50 off"]);
  });

  it("handles empty / nullish input", () => {
    expect(parseKeywords("")).toEqual([]);
    expect(parseKeywords(undefined)).toEqual([]);
    expect(parseKeywords(null)).toEqual([]);
  });

  it("caps at 50 keywords", () => {
    const many = Array.from({ length: 80 }, (_, i) => `k${i}`).join(",");
    expect(parseKeywords(many)).toHaveLength(50);
  });
});

describe("buildNameOrFilter", () => {
  it("builds an OR of case-insensitive substring matches on business_name", () => {
    expect(buildNameOrFilter(["plumbing", "electrical"])).toBe(
      "business_name.ilike.*plumbing*,business_name.ilike.*electrical*",
    );
  });

  it("returns empty string for no keywords", () => {
    expect(buildNameOrFilter([])).toBe("");
  });
});

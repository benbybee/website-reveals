import { describe, it, expect } from "vitest";
import { toStateAbbr } from "./state";

describe("toStateAbbr", () => {
  it("maps full name", () => expect(toStateAbbr("Arizona")).toBe("AZ"));
  it("maps lowercase abbr", () => expect(toStateAbbr("az")).toBe("AZ"));
  it("passes through valid abbr", () => expect(toStateAbbr("TX")).toBe("TX"));
  it("handles mixed-case full name", () => expect(toStateAbbr("new york")).toBe("NY"));
  it("returns null for unknown", () => expect(toStateAbbr("Freedonia")).toBeNull());
  it("returns null for empty", () => expect(toStateAbbr("")).toBeNull());
});

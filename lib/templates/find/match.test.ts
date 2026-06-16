import { describe, it, expect } from "vitest";
import { normalizeZip, normalizeName } from "./match";

describe("normalizeZip", () => {
  it("keeps the first 5 digits", () => {
    expect(normalizeZip("85201")).toBe("85201");
    expect(normalizeZip("85201-1234")).toBe("85201");
    expect(normalizeZip(" 85201 ")).toBe("85201");
  });
  it("returns empty for non-5-digit input", () => {
    expect(normalizeZip("852")).toBe("");
    expect(normalizeZip("")).toBe("");
    expect(normalizeZip("abcde")).toBe("");
  });
});

describe("normalizeName", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeName("  Joe's   Pest  ")).toBe("Joe's Pest");
  });
  it("returns empty for blank", () => {
    expect(normalizeName("   ")).toBe("");
  });
});

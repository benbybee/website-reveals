import { describe, it, expect } from "vitest";
import { normalizeZip, normalizeName, classifyMatches, type FindRow } from "./match";

const row = (id: string, name: string): FindRow => ({
  id, business_name: name, city: "Mesa", state: "AZ", preview_url: "https://x.pages.dev", sim: 0.9,
});

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

describe("classifyMatches", () => {
  it("none when no rows", () => {
    expect(classifyMatches([]).kind).toBe("none");
  });
  it("one when a single row", () => {
    const r = classifyMatches([row("a", "Joe's Pest")]);
    expect(r.kind).toBe("one");
    if (r.kind === "one") expect(r.match.id).toBe("a");
  });
  it("many when multiple rows", () => {
    const r = classifyMatches([row("a", "Joe's Pest"), row("b", "Joe's Pest Co")]);
    expect(r.kind).toBe("many");
    if (r.kind === "many") expect(r.matches).toHaveLength(2);
  });
});

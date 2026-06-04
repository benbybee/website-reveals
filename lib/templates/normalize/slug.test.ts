import { describe, it, expect } from "vitest";
import { slugify, isValidSlug, SLUG_RE } from "./slug";

describe("isValidSlug", () => {
  it("accepts lowercase alphanumeric + interior hyphens", () => {
    expect(isValidSlug("acme-plumbing")).toBe(true);
    expect(isValidSlug("a")).toBe(true);
    expect(isValidSlug("joe-s-pest-123")).toBe(true);
  });

  it("rejects leading/trailing hyphens, caps, spaces, and over-length", () => {
    expect(isValidSlug("-acme")).toBe(false);
    expect(isValidSlug("acme-")).toBe(false);
    expect(isValidSlug("Acme")).toBe(false);
    expect(isValidSlug("acme plumbing")).toBe(false);
    expect(isValidSlug("a".repeat(61))).toBe(false);
    expect(isValidSlug(123 as unknown)).toBe(false);
    expect(isValidSlug("")).toBe(false);
  });

  it("accepts exactly 60 chars but not 61", () => {
    expect(isValidSlug("a".repeat(60))).toBe(true);
    expect(SLUG_RE.test("a".repeat(60))).toBe(true);
  });
});

describe("slugify", () => {
  it("produces a SLUG_RE-valid slug from a business name", () => {
    const s = slugify("Joe's Pest & Termite, LLC");
    expect(s).toBe("joe-s-pest-termite-llc");
    expect(isValidSlug(s)).toBe(true);
  });

  it("strips accents and collapses separators", () => {
    expect(slugify("Café Déjà Vu")).toBe("cafe-deja-vu");
  });

  it("caps to 60 chars without a trailing hyphen", () => {
    const s = slugify("a".repeat(58) + " " + "b".repeat(10));
    expect(s.length).toBeLessThanOrEqual(60);
    expect(isValidSlug(s)).toBe(true);
  });

  it("returns empty string when nothing usable remains", () => {
    expect(slugify("—  —")).toBe("");
    expect(slugify("")).toBe("");
  });
});

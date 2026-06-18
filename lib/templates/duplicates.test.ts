import { describe, it, expect } from "vitest";
import { normalizeName, hasSite, computeDuplicateGroups, type DupRow } from "./duplicates";

function row(p: Partial<DupRow> & { id: string }): DupRow {
  return {
    id: p.id,
    business_name: p.business_name ?? null,
    preview_url: p.preview_url ?? null,
    stage: p.stage ?? "qualified",
    phone: p.phone ?? null,
    city: p.city ?? null,
    website: p.website ?? null,
    created_at: p.created_at ?? null,
  };
}

describe("normalizeName", () => {
  it("collapses case, punctuation, and entity suffixes", () => {
    expect(normalizeName("ABC Plumbing, LLC")).toBe("abc plumbing");
    expect(normalizeName("abc   plumbing inc")).toBe("abc plumbing");
    expect(normalizeName("The Co.")).toBe("");
  });
  it("handles null/empty", () => {
    expect(normalizeName(null)).toBe("");
    expect(normalizeName("")).toBe("");
  });
});

describe("hasSite", () => {
  it("is true with a preview_url or in the build pipeline", () => {
    expect(hasSite(row({ id: "a", preview_url: "https://x.pages.dev" }))).toBe(true);
    expect(hasSite(row({ id: "b", stage: "building" }))).toBe(true);
    expect(hasSite(row({ id: "c", stage: "live" }))).toBe(true);
    expect(hasSite(row({ id: "d", stage: "qualified" }))).toBe(false);
  });
});

describe("computeDuplicateGroups", () => {
  it("keeps one and removes the rest within a normalized-name group", () => {
    const res = computeDuplicateGroups([
      row({ id: "1", business_name: "ABC Plumbing", phone: "1", city: "x", website: "w", created_at: "2026-01-01" }),
      row({ id: "2", business_name: "ABC Plumbing, LLC", created_at: "2026-02-01" }),
      row({ id: "3", business_name: "Unique Biz" }),
    ]);
    expect(res.removable).toBe(1);
    expect(res.removeIds).toEqual(["2"]); // id 1 is more complete → kept
    expect(res.groups[0].keepId).toBe("1");
  });

  it("NEVER removes a site-generated lead; it becomes the keeper", () => {
    const res = computeDuplicateGroups([
      row({ id: "1", business_name: "ACME HVAC", phone: "1", city: "x", website: "w" }), // most complete but no site
      row({ id: "2", business_name: "acme hvac", preview_url: "https://acme.pages.dev" }), // has site
    ]);
    expect(res.removeIds).toEqual(["1"]); // the sited one (2) is kept, the plain one removed
    expect(res.groups[0].keepId).toBe("2");
  });

  it("removes nothing when every copy has a site", () => {
    const res = computeDuplicateGroups([
      row({ id: "1", business_name: "Dup", preview_url: "https://a.dev" }),
      row({ id: "2", business_name: "dup", stage: "live" }),
    ]);
    expect(res.removable).toBe(0);
    expect(res.groups).toEqual([]);
  });

  it("ignores singletons and nameless rows", () => {
    const res = computeDuplicateGroups([
      row({ id: "1", business_name: "Solo" }),
      row({ id: "2", business_name: null }),
      row({ id: "3", business_name: null }),
    ]);
    expect(res.removable).toBe(0);
  });
});

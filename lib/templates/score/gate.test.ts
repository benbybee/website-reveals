import { describe, it, expect } from "vitest";
import { scoreRecord, isQualified } from "./gate";
import type { CanonicalRecord } from "../types";

const base: CanonicalRecord = {
  source_id: "wr-tpl-x",
  business_name: "Joe's Pest",
  industry_slug: "pest-control",
  address: { street: "1 Main", city: "Mesa", state: "AZ", zip: "85201", country: "US" },
  phone: "+14805551234",
  photos: [{ slot: "hero", src_url: "https://x/p.jpg" }],
} as CanonicalRecord;

describe("gate", () => {
  it("qualifies a record meeting the minimum", () => {
    const s = scoreRecord(base);
    expect(isQualified(s)).toBe(true);
    expect(s.missing).toEqual([]);
  });
  it("fails without phone", () => {
    const s = scoreRecord({ ...base, phone: undefined as never });
    expect(isQualified(s)).toBe(false);
    expect(s.missing).toContain("phone");
  });
  it("fails with neither logo nor photos", () => {
    const s = scoreRecord({ ...base, photos: [] });
    expect(isQualified(s)).toBe(false);
    expect(s.missing).toContain("logo_or_photos");
  });
  it("lowers confidence when identity anchor is weak", () => {
    const weak = scoreRecord({ ...base, address: { ...base.address, street: "" } });
    expect(weak.confidence).toBeLessThan(scoreRecord(base).confidence);
  });
});

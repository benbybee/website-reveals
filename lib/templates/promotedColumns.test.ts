import { describe, it, expect } from "vitest";
import { promotedColumns } from "./promotedColumns";
import type { CanonicalRecord } from "./types";

const base: CanonicalRecord = {
  source_id: "wr-tpl-x",
  business_name: "Zap Pest Control",
  industry_slug: "home-services",
  address: { street: "1 Main", city: "Gunnison", state: "UT", zip: "84634-1234", country: "US" },
  phone: "+14355551234",
  website: "https://zap.example",
  website_status: "has_site",
};

describe("promotedColumns", () => {
  it("promotes the normalized 5-digit zip from record.address (the /join match key)", () => {
    expect(promotedColumns(base).zip).toBe("84634");
  });
  it("mirrors the core columns", () => {
    const c = promotedColumns(base);
    expect(c).toMatchObject({
      business_name: "Zap Pest Control",
      city: "Gunnison",
      state: "UT",
      phone: "+14355551234",
      website: "https://zap.example",
      website_status: "has_site",
    });
  });
  it("nulls empty strings and defaults website_status", () => {
    const r = { ...base, business_name: "", website: "", website_status: undefined, address: { ...base.address, zip: "" } } as CanonicalRecord;
    const c = promotedColumns(r);
    expect(c.business_name).toBeNull();
    expect(c.website).toBeNull();
    expect(c.zip).toBeNull();
    expect(c.website_status).toBe("none");
  });
});

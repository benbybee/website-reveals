import { describe, it, expect } from "vitest";
import { toPrepBrief } from "./toPrepBrief";
import type { CanonicalRecord } from "../types";

const rec: CanonicalRecord = {
  source_id: "wr-tpl-x",
  business_name: "Joe's Pest",
  industry_raw: "Pest control service",
  industry_slug: "home-services",
  description: "Family-owned pest control",
  services: [{ name: "Termite", description: "Termite treatment" }],
  address: { street: "1 Main", city: "Mesa", state: "AZ", zip: "85201", country: "US" },
  phone: "+14805551234",
  email: "joe@pest.com",
  hours: [{ day: "mon", open: "08:00", close: "17:00" }],
  brand_colors: { primary: "#111", accent: "#222", neutral_dark: "#000", neutral_light: "#fff" },
  logo: { src_url: "https://x/logo.png" },
  photos: [{ slot: "hero", src_url: "https://x/p.jpg", alt: "front" }],
};

describe("toPrepBrief", () => {
  it("maps canonical record into SL prep.brief shape", () => {
    expect(toPrepBrief(rec)).toMatchObject({
      brief: {
        business: {
          name: rec.business_name,
          industry: rec.industry_raw,
          industry_slug: rec.industry_slug,
          services: rec.services,
        },
        contact: { address: rec.address, phone: rec.phone, email: rec.email, hours: rec.hours },
        brand: { colors: rec.brand_colors },
      },
      current_site_brand: { logo_url: rec.logo?.src_url ?? null },
      stock_photos: rec.photos!.map((p) => ({ slot: p.slot, src_url: p.src_url, alt: p.alt ?? "" })),
    });
  });

  it("omits kura_input for speculative Stage-1 records", () => {
    expect("kura_input" in toPrepBrief(rec)).toBe(false);
  });

  it("nulls logo_url when no logo present", () => {
    const { logo, ...noLogo } = rec;
    void logo;
    expect(toPrepBrief(noLogo as CanonicalRecord).current_site_brand.logo_url).toBeNull();
  });
});

import { describe, it, expect } from "vitest";
import { toPrepBrief } from "./toPrepBrief";
import { validatePrepBrief } from "./contract";
import type { CanonicalRecord } from "../types";

// A fully-enriched canonical record (WR-internal fixture — not an Apify response).
const enriched: CanonicalRecord = {
  source_id: "wr-tpl-ChIJ123",
  scraped_at: "2026-05-30T00:00:00Z",
  confidence: 1,
  business_name: "Gilbert Pest Pros",
  industry_raw: "Pest control service",
  industry_slug: "home-services",
  description: "Family-owned pest control in Gilbert, AZ.",
  services: [
    { name: "Termite Control", description: "Inspection + treatment" },
    { name: "Rodent Removal", description: "Humane trapping" },
  ],
  address: { street: "123 E Main St", city: "Gilbert", state: "AZ", zip: "85234", country: "US" },
  phone: "+14805551234",
  email: "info@gilbertpest.com",
  hours: [{ day: "mon", open: "08:00", close: "17:00" }],
  geo: { lat: 33.35, lng: -111.79 },
  brand_colors: { primary: "#0a3d62", accent: "#e58e26", neutral_dark: "#1e272e", neutral_light: "#f5f6fa" },
  logo: { src_url: "https://x/logo.png", width: 200, height: 200 },
  photos: [{ slot: "hero", src_url: "https://x/hero.jpg", alt: "team" }],
  socials: { facebook: "https://facebook.com/gilbertpest" },
  sources: ["google-places", "facebook"],
};

describe("SL contract", () => {
  it("a fully-enriched record satisfies SL's required prep.brief fields", () => {
    const result = validatePrepBrief(toPrepBrief(enriched));
    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it("flags a missing industry_slug", () => {
    const brief = toPrepBrief({ ...enriched, industry_slug: "" });
    expect(validatePrepBrief(brief).missing).toContain("brief.business.industry_slug");
  });

  it("requires the full 4-key brand.colors shape when colors are present", () => {
    const brief = toPrepBrief({
      ...enriched,
      brand_colors: { primary: "#000", accent: "", neutral_dark: "#111", neutral_light: "#fff" },
    });
    expect(validatePrepBrief(brief).missing).toContain("brief.brand.colors.accent");
  });
});

import { describe, it, expect } from "vitest";
import { toBuildPayload, validateBuildPayload } from "./toBuildPayload";
import type { CanonicalRecord } from "../types";

const rec: CanonicalRecord = {
  source_id: "wr-tpl-ChIJ123",
  business_name: "Joe's Pest",
  industry_raw: "Pest control service",
  industry_slug: "home-services",
  description: "Family-owned pest control",
  services: [
    { name: "Termite Control", description: "..." },
    { name: "Rodent Removal" },
  ],
  address: { street: "1 Main", city: "Mesa", state: "AZ", zip: "85201", country: "US" },
  phone: "+14805551234",
  email: "joe@pest.com",
  brand_colors: { primary: "#111111", accent: "#222222", neutral_dark: "#000000", neutral_light: "#ffffff" },
  logo: { src_url: "https://x/logo.png" },
  photos: [
    { slot: "hero", src_url: "https://x/hero.jpg", alt: "front" },
    { slot: "service-1", src_url: "https://x/s1.jpg" },
    { slot: "service-2", src_url: "https://x/s2.jpg" },
  ],
};

describe("toBuildPayload", () => {
  it("maps a canonical record into SL's flat per-build brief", () => {
    const p = toBuildPayload(rec);
    expect(p.external_id).toBe("wr-tpl-ChIJ123"); // dedup key = source_id
    expect(p.form_type).toBe("quick");
    expect(p.brief).toMatchObject({
      business_name: "Joe's Pest",
      industry: "Pest control service",
      what_you_do: "Family-owned pest control",
      all_services: "Termite Control, Rodent Removal",
      address: "1 Main, Mesa, AZ 85201",
      contact_phone: "+14805551234",
      contact_email: "joe@pest.com",
      brand_colors: ["#111111", "#222222", "#000000", "#ffffff"],
      logo_url: "https://x/logo.png",
    });
  });

  it("never ships photo fields to SL (operator bakes imagery by hand)", () => {
    const p = toBuildPayload(rec);
    expect(p.brief).not.toHaveProperty("hero_images");
    expect(p.brief).not.toHaveProperty("image_urls");
  });

  it("falls back to industry_slug when industry_raw is absent", () => {
    const { industry_raw, ...noRaw } = rec;
    void industry_raw;
    expect(toBuildPayload(noRaw as CanonicalRecord).brief.industry).toBe("home-services");
  });

  it("omits optional keys when the record lacks them (owner-less is valid)", () => {
    const minimal: CanonicalRecord = {
      source_id: "wr-tpl-min",
      business_name: "Bare",
      industry_slug: "home-services",
      address: { street: "1 Main", city: "Mesa", state: "AZ", zip: "85201", country: "US" },
      phone: "+1480",
    };
    const p = toBuildPayload(minimal);
    expect(p.brief.contact_email).toBeUndefined();
    expect(p.brief.brand_colors).toBeUndefined();
    expect(p.brief.logo_url).toBeUndefined();
    expect(validateBuildPayload(p).ok).toBe(true);
  });
});

describe("validateBuildPayload", () => {
  it("flags missing required fields", () => {
    const p = toBuildPayload({ ...rec, business_name: "", industry_raw: "", industry_slug: "" });
    const r = validateBuildPayload(p);
    expect(r.ok).toBe(false);
    expect(r.missing).toContain("brief.business_name");
    expect(r.missing).toContain("brief.industry");
  });
});

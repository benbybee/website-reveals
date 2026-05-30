import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { assembleRecord } from "./index";
import { mapPlaceToRecord, type PlaceItem } from "../apify/places";

const places = JSON.parse(
  readFileSync(fileURLToPath(new URL("../__fixtures__/places.json", import.meta.url)), "utf8"),
) as PlaceItem[];

describe("assembleRecord (fixture-based end-to-end)", () => {
  it("produces a qualified record from a real place + industry_slug (no FB needed)", () => {
    const place = mapPlaceToRecord(places[0]);
    const { record, score } = assembleRecord({
      place,
      gbpCategories: places[0].categories ?? [],
      industrySlug: "home-services",
    });

    expect(record.industry_slug).toBe("home-services");
    expect(record.business_name).toBe("CAPE Pest Control");
    expect(record.services).toEqual([{ name: "Pest control service" }]);
    expect(record.confidence).toBeGreaterThan(0.9);
    // has name+address+phone+industry_slug+source_id and a hero photo → qualified
    expect(score.missing).toEqual([]);
  });

  it("fills logo/description gaps from Facebook without overwriting GBP values", () => {
    const place = mapPlaceToRecord(places[0]);
    const { record } = assembleRecord({
      place,
      facebook: { logo: { src_url: "https://x/logo.jpg" }, description: "From FB", socials: { facebook: "https://fb/acme" } },
      gbpCategories: places[0].categories ?? [],
      industrySlug: "home-services",
    });
    expect(record.logo).toEqual({ src_url: "https://x/logo.jpg" });
    expect(record.description).toBe("From FB");
    expect(record.sources).toContain("facebook");
    expect(record.sources).toContain("google-places");
  });

  it("applies brand colors from a palette", () => {
    const place = mapPlaceToRecord(places[0]);
    const { record } = assembleRecord({
      place,
      palette: ["#0a3d62", "#e58e26", "#1e272e", "#f5f6fa"],
      industrySlug: "home-services",
    });
    expect(record.brand_colors).not.toBeUndefined();
    expect(record.brand_colors?.primary).toMatch(/^#[0-9a-f]{6}$/);
  });
});

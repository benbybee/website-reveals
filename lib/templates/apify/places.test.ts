import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { mapPlaceToRecord, type PlaceItem } from "./places";

const fixture = JSON.parse(
  readFileSync(fileURLToPath(new URL("../__fixtures__/places.json", import.meta.url)), "utf8"),
) as PlaceItem[];

describe("mapPlaceToRecord (real Google Places fixture)", () => {
  const first = mapPlaceToRecord(fixture[0]);

  it("derives a stable source_id from placeId", () => {
    expect(first.source_id).toBe(`wr-tpl-${fixture[0].placeId}`);
  });

  it("maps name, industry_raw and the US address with a 2-letter state", () => {
    expect(first.business_name).toBe("CAPE Pest Control");
    expect(first.industry_raw).toBe("Pest control service");
    expect(first.address).toEqual({
      street: "725 W Elliot Rd Ste 102",
      city: "Gilbert",
      state: "AZ",
      zip: "85233",
      country: "US",
    });
  });

  it("normalizes the phone to E.164", () => {
    expect(first.phone).toBe("+14804282720");
  });

  it("flags has_site and keeps the absolutized website", () => {
    expect(first.website_status).toBe("has_site");
    expect(first.website).toBe("https://www.capepest.co/");
  });

  it("maps geo coordinates", () => {
    expect(first.geo).toEqual({ lat: 33.3493354, lng: -111.8056638 });
  });

  it("parses GBP range hours and marks closed days", () => {
    expect(first.hours).toContainEqual({ day: "mon", open: "08:00", close: "18:00" });
    expect(first.hours).toContainEqual({ day: "sat", closed: true });
    expect(first.hours).toContainEqual({ day: "sun", closed: true });
  });

  it("captures the hero image as a photo and tags the source", () => {
    expect(first.photos?.[0]?.slot).toBe("hero");
    expect(first.photos?.[0]?.src_url).toContain("googleusercontent.com");
    expect(first.sources).toEqual(["google-places"]);
  });

  it("does not set industry_slug (comes from campaign config)", () => {
    expect(first.industry_slug).toBeUndefined();
  });
});

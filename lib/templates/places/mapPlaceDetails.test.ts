import { describe, it, expect } from "vitest";
import { mapPlaceDetails } from "./mapPlaceDetails";
import type { PlaceDetails } from "./client";

const details: PlaceDetails = {
  placeId: "ChIJabc123",
  name: "Reece HVAC",
  website: "https://reecehvac.com",
  phone: "+14805551234",
  address: { street: "123 Main St", city: "Mesa", state: "AZ", zip: "85201", country: "US" },
  hours: [{ day: "mon", open: "08:00", close: "17:30" }],
  categories: ["hvac_contractor", "point_of_interest"],
  photoRefs: ["places/ChIJabc123/photos/AbC"],
  geo: { lat: 33.41, lng: -111.83 },
};

describe("mapPlaceDetails", () => {
  it("maps a PlaceDetails to a partial CanonicalRecord with the wr-gbp source_id", () => {
    const rec = mapPlaceDetails(details);
    expect(rec.source_id).toBe("wr-gbp-ChIJabc123");
    expect(rec.business_name).toBe("Reece HVAC");
    expect(rec.address).toEqual(details.address);
    expect(rec.phone).toBe("+14805551234");
    expect(rec.website).toBe("https://reecehvac.com");
    expect(rec.website_status).toBe("has_site");
    expect(rec.geo).toEqual({ lat: 33.41, lng: -111.83 });
    expect(rec.hours).toEqual(details.hours);
    expect(rec.industry_raw).toBe("hvac_contractor");
    expect(rec.sources).toEqual(["google-places"]);
  });

  it("never sets industry_slug (stamped from the picked industry, like discover)", () => {
    const rec = mapPlaceDetails(details);
    expect(rec.industry_slug).toBeUndefined();
  });

  it("marks website_status none when the business has no site", () => {
    const rec = mapPlaceDetails({ ...details, website: undefined });
    expect(rec.website).toBeUndefined();
    expect(rec.website_status).toBe("none");
  });
});

import { describe, it, expect, vi, afterEach } from "vitest";
import { placesAutocomplete, placeDetails, PlacesDisabledError } from "./client";

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.GOOGLE_PLACES_API_KEY;
});

const AUTOCOMPLETE_RES = {
  suggestions: [
    { placePrediction: { placeId: "place-1", text: { text: "Reece HVAC, Mesa AZ" } } },
    { placePrediction: { placeId: "place-2", text: { text: "Reece Heating, Gilbert AZ" } } },
    { queryPrediction: { text: { text: "ignored — not a place" } } },
  ],
};

const DETAILS_RES = {
  id: "place-1",
  displayName: { text: "Reece HVAC" },
  formattedAddress: "123 Main St, Mesa, AZ 85201, USA",
  addressComponents: [
    { longText: "123", shortText: "123", types: ["street_number"] },
    { longText: "Main St", shortText: "Main St", types: ["route"] },
    { longText: "Mesa", shortText: "Mesa", types: ["locality"] },
    { longText: "Arizona", shortText: "AZ", types: ["administrative_area_level_1"] },
    { longText: "85201", shortText: "85201", types: ["postal_code"] },
    { longText: "United States", shortText: "US", types: ["country"] },
  ],
  internationalPhoneNumber: "+1 480-555-1234",
  websiteUri: "https://reecehvac.com",
  regularOpeningHours: {
    periods: [
      { open: { day: 1, hour: 8, minute: 0 }, close: { day: 1, hour: 17, minute: 30 } },
      { open: { day: 0, hour: 0, minute: 0 } }, // Sunday open 24h (no close)
    ],
  },
  types: ["hvac_contractor", "point_of_interest"],
  location: { latitude: 33.41, longitude: -111.83 },
  photos: [{ name: "places/place-1/photos/AbC" }, { name: "places/place-1/photos/XyZ" }],
};

describe("placesAutocomplete", () => {
  it("throws PlacesDisabledError when the key is unset", async () => {
    await expect(placesAutocomplete("reece")).rejects.toBeInstanceOf(PlacesDisabledError);
  });

  it("returns placeId + description for each place prediction", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "test-key";
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(AUTOCOMPLETE_RES), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock as never);

    const out = await placesAutocomplete("reece hvac");

    expect(out).toEqual([
      { placeId: "place-1", description: "Reece HVAC, Mesa AZ" },
      { placeId: "place-2", description: "Reece Heating, Gilbert AZ" },
    ]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/places:autocomplete");
    expect((init.headers as Record<string, string>)["X-Goog-Api-Key"]).toBe("test-key");
    expect(init.method).toBe("POST");
  });
});

describe("placeDetails", () => {
  it("throws PlacesDisabledError when the key is unset", async () => {
    await expect(placeDetails("place-1")).rejects.toBeInstanceOf(PlacesDisabledError);
  });

  it("normalizes name/address/phone/hours/geo/categories/photoRefs", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "test-key";
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(DETAILS_RES), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock as never);

    const d = await placeDetails("place-1");

    expect(d.placeId).toBe("place-1");
    expect(d.name).toBe("Reece HVAC");
    expect(d.website).toBe("https://reecehvac.com");
    expect(d.phone).toBe("+14805551234"); // E164
    expect(d.address).toEqual({
      street: "123 Main St",
      city: "Mesa",
      state: "AZ",
      zip: "85201",
      country: "US",
    });
    expect(d.geo).toEqual({ lat: 33.41, lng: -111.83 });
    expect(d.categories).toContain("hvac_contractor");
    expect(d.photoRefs).toEqual(["places/place-1/photos/AbC", "places/place-1/photos/XyZ"]);
    expect(d.hours).toEqual([
      { day: "mon", open: "08:00", close: "17:30" },
      { day: "sun", open: "00:00", close: "23:59" },
    ]);
    // Field mask + api key must be sent as headers on the GET.
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/places/place-1");
    expect((init.headers as Record<string, string>)["X-Goog-FieldMask"]).toContain("regularOpeningHours");
  });

  it("records a Places cost event (actor google-places, stage find) with rep_id when db+campaign given", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify(DETAILS_RES), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ) as never,
    );
    const inserted: Record<string, unknown>[] = [];
    const db = {
      from: (table: string) => ({
        insert: (row: Record<string, unknown>) => {
          inserted.push({ table, ...row });
          return Promise.resolve({ error: null });
        },
      }),
    };

    await placeDetails("place-1", { db: db as never, campaignId: "camp-1", repId: "rep-1" });

    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      table: "tpl_cost_events",
      campaign_id: "camp-1",
      stage: "find",
      actor: "google-places",
      units: 1,
      rep_id: "rep-1",
    });
    expect(Number(inserted[0].usd)).toBeGreaterThan(0);
  });
});

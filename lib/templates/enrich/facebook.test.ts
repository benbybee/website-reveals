import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { mapFacebookToRecord, isFacebookError, type FacebookItem } from "./facebook";

const fixture = JSON.parse(
  readFileSync(fileURLToPath(new URL("../__fixtures__/facebook.json", import.meta.url)), "utf8"),
) as FacebookItem[];

describe("mapFacebookToRecord", () => {
  it("detects the real not_available error fixture and yields no enrichment", () => {
    expect(isFacebookError(fixture[0])).toBe(true);
    expect(mapFacebookToRecord(fixture[0])).toEqual({});
  });

  it("maps logo, cover photo, about and social link from a page-data item", () => {
    const rec = mapFacebookToRecord({
      url: "https://facebook.com/acme",
      profilePictureUrl: "https://x/logo.jpg",
      coverPhotoUrl: "https://x/cover.jpg",
      about: "Family pest control",
    });
    expect(rec.logo).toEqual({ src_url: "https://x/logo.jpg" });
    expect(rec.photos).toEqual([{ slot: "about", src_url: "https://x/cover.jpg" }]);
    expect(rec.description).toBe("Family pest control");
    expect(rec.socials?.facebook).toBe("https://facebook.com/acme");
  });
});

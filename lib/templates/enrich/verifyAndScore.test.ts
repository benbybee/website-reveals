import { describe, it, expect, vi, afterEach } from "vitest";
import { verifyAndScore } from "./index";
import { scoreRecord } from "../score/gate";
import type { CanonicalRecord } from "../types";

afterEach(() => vi.restoreAllMocks());

const img = () =>
  new Response(null, { status: 200, headers: { "content-type": "image/png" } });
const dead = () => new Response(null, { status: 404 });

// A record as it looks AFTER assembleRecord merges the Firecrawl/Facebook logo +
// photos — i.e. the exact point where gap 3 previously shipped a dead logo.
const assembled: CanonicalRecord = {
  source_id: "wr-gbp-x",
  business_name: "Reece HVAC",
  industry_slug: "hvac",
  address: { street: "1 Main", city: "Mesa", state: "AZ", zip: "85201", country: "US" },
  phone: "+14805551234",
  logo: { src_url: "https://x/merged-logo.png" },
  photos: [
    { slot: "hero", src_url: "https://x/live.jpg" },
    { slot: "about", src_url: "https://x/dead.jpg" },
  ],
};

describe("verifyAndScore", () => {
  it("re-verifies the merged assets and re-scores on what survives", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => (url.includes("dead") ? dead() : img())) as never,
    );

    const { record, score } = await verifyAndScore(assembled);

    expect(record.logo?.src_url).toBe("https://x/merged-logo.png"); // live merged logo survives
    expect(record.photos?.map((p) => p.src_url)).toEqual(["https://x/live.jpg"]); // dead photo pruned
    expect(score).toEqual(scoreRecord(record)); // score reflects the verified record
    expect(record.confidence).toBe(score.confidence);
  });

  it("drops a dead merged logo so it never ships, and the score reflects the loss", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => dead()) as never);

    const noPhotos = { ...assembled, photos: [] };
    const preScore = scoreRecord(noPhotos); // logo present → logo_or_photos counted

    const { record, score } = await verifyAndScore(noPhotos);

    expect(record.logo).toBeUndefined(); // dead merged logo dropped
    expect(score).toEqual(scoreRecord(record));
    expect(score.completeness).toBeLessThan(preScore.completeness); // lost the soft signal
  });
});

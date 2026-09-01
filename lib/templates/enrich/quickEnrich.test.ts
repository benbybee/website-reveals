import { describe, it, expect, vi, afterEach } from "vitest";

// Mock the Firecrawl branding fallback; both this test and quickEnrich import it
// by the same specifier, so the mock intercepts quickEnrich's call.
vi.mock("../../firecrawl", () => ({ scrapeBrandDNA: vi.fn() }));
vi.mock("../places/client", () => ({ resolvePlacePhotoUrl: vi.fn() }));
import { scrapeBrandDNA } from "../../firecrawl";
import { resolvePlacePhotoUrl } from "../places/client";
import { quickEnrich } from "./quickEnrich";
import type { CanonicalRecord } from "../types";

const place: Partial<CanonicalRecord> = {
  source_id: "wr-gbp-abc",
  business_name: "Reece HVAC",
  address: { street: "1 Main", city: "Mesa", state: "AZ", zip: "85201", country: "US" },
  phone: "+14805551234",
  website: "https://reecehvac.com",
  website_status: "has_site",
  industry_raw: "hvac_contractor",
  sources: ["google-places"],
};

const HTML_RICH = `
  <link rel="apple-touch-icon" href="/logo.png">
  <meta property="og:image" content="https://reecehvac.com/hero.jpg">
  <a href="mailto:info@reecehvac.com">email us</a>
  <style>.a{color:#1a73e8}.b{color:#1a73e8}.c{background:#ff6f00}</style>`;

const imageOk = () => new Response(null, { status: 200, headers: { "content-type": "image/png" } });
const notFound = () => new Response(null, { status: 404 });

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  delete process.env.FIRECRAWL_API_KEY;
  delete process.env.GOOGLE_PLACES_API_KEY;
});

describe("quickEnrich", () => {
  it("fills logo/colors/services/email/photos deterministically, no Firecrawl", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => imageOk()) as never);

    const { record } = await quickEnrich({ place, industrySlug: "hvac", html: HTML_RICH });

    expect(record.industry_slug).toBe("hvac");
    expect(record.logo?.src_url).toBe("https://reecehvac.com/logo.png");
    expect(record.brand_colors?.primary).toBeTruthy();
    expect(record.services?.length ?? 0).toBeGreaterThanOrEqual(3); // default services (Places gives none)
    expect(record.email).toBe("info@reecehvac.com"); // from mailto
    expect(record.photos?.some((p) => p.src_url === "https://reecehvac.com/hero.jpg")).toBe(true);
    expect(record.sources).toContain("site-parse");
    expect(scrapeBrandDNA).not.toHaveBeenCalled();
  });

  it("calls Firecrawl branding exactly once when deterministic logo AND colors are both empty", async () => {
    process.env.FIRECRAWL_API_KEY = "fc-key";
    vi.mocked(scrapeBrandDNA).mockResolvedValue({
      url: "https://reecehvac.com",
      logoUrl: "https://reecehvac.com/fc-logo.png",
      primaryColor: "#123456",
      colors: {},
      creditsUsed: 5,
    });
    vi.stubGlobal("fetch", vi.fn(async () => imageOk()) as never);

    const { record } = await quickEnrich({
      place,
      industrySlug: "hvac",
      html: "<html><body><p>Reece HVAC</p></body></html>", // no logo, colors, or photos
    });

    expect(scrapeBrandDNA).toHaveBeenCalledTimes(1);
    expect(record.logo?.src_url).toBe("https://reecehvac.com/fc-logo.png");
    expect(record.brand_colors?.primary).toBe("#123456");
    expect(record.sources).toContain("firecrawl");
  });

  it("does NOT call Firecrawl when it is unconfigured, even on a deterministic miss", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => imageOk()) as never);
    const { record } = await quickEnrich({ place, industrySlug: "hvac", html: "<p>bare</p>" });
    expect(scrapeBrandDNA).not.toHaveBeenCalled();
    expect(record.logo).toBeUndefined();
  });

  it("HEAD-verifies merged assets — a dead logo is pruned, a live photo kept", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => (url.includes("logo.png") ? notFound() : imageOk())) as never,
    );
    const { record } = await quickEnrich({ place, industrySlug: "hvac", html: HTML_RICH });
    expect(record.logo).toBeUndefined();
    expect(record.photos?.some((p) => p.src_url.includes("hero.jpg"))).toBe(true);
  });

  it("records a Firecrawl cost event with rep_id when db+campaign are given", async () => {
    process.env.FIRECRAWL_API_KEY = "fc-key";
    vi.mocked(scrapeBrandDNA).mockResolvedValue({
      url: "https://reecehvac.com",
      logoUrl: "https://reecehvac.com/fc.png",
      primaryColor: "#123456",
      colors: {},
      creditsUsed: 5,
    });
    vi.stubGlobal("fetch", vi.fn(async () => imageOk()) as never);

    const inserted: Record<string, unknown>[] = [];
    const db = {
      from: () => ({
        insert: (row: Record<string, unknown>) => {
          inserted.push(row);
          return Promise.resolve({ error: null });
        },
      }),
    };

    await quickEnrich({
      place,
      industrySlug: "hvac",
      html: "<p>bare</p>",
      db: db as never,
      campaignId: "camp-1",
      repId: "rep-1",
    });

    const fc = inserted.find((r) => r.actor === "firecrawl");
    expect(fc).toBeTruthy();
    expect(fc?.stage).toBe("enrich");
    expect(fc?.rep_id).toBe("rep-1");
  });

  it("fills photos with real Google Places business photos + ledgers the cost", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "test-key";
    vi.mocked(resolvePlacePhotoUrl).mockImplementation(async (ref: string) => `https://lh3/${ref}.jpg`);
    vi.stubGlobal("fetch", vi.fn(async () => imageOk()) as never);

    const inserted: Record<string, unknown>[] = [];
    const db = {
      from: () => ({
        insert: (row: Record<string, unknown>) => {
          inserted.push(row);
          return Promise.resolve({ error: null });
        },
      }),
    };

    const { record } = await quickEnrich({
      place,
      industrySlug: "hvac",
      html: "<p>bare</p>", // no site photos → Places fills
      photoRefs: ["places/p/photos/A", "places/p/photos/B"],
      db: db as never,
      campaignId: "camp-1",
      repId: "rep-1",
    });

    const urls = record.photos?.map((p) => p.src_url) ?? [];
    expect(urls).toContain("https://lh3/places/p/photos/A.jpg");
    expect(urls).toContain("https://lh3/places/p/photos/B.jpg");
    const photoCost = inserted.find((r) => r.actor === "google-places-photo");
    expect(photoCost).toBeTruthy();
    expect(photoCost?.rep_id).toBe("rep-1");
    expect(record.sources).toContain("google-places-photo");
  });

  it("does not resolve Places photos when the site already yields enough", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "test-key";
    vi.mocked(resolvePlacePhotoUrl).mockResolvedValue("https://lh3/unused.jpg");
    vi.stubGlobal("fetch", vi.fn(async () => imageOk()) as never);

    // HTML_RICH yields a site photo; TARGET gap logic should still call for more,
    // so instead give 6 site photos to prove Places is skipped when full.
    const sixImgs = Array.from({ length: 6 }, (_, i) => `<img src="/p/${i}.jpg" width="800" height="600">`).join("");
    await quickEnrich({ place, industrySlug: "hvac", html: sixImgs, photoRefs: ["places/p/photos/A"] });
    expect(resolvePlacePhotoUrl).not.toHaveBeenCalled();
  });

  it("treats a framework-default favicon as no logo → Firecrawl takes over (SPA)", async () => {
    process.env.FIRECRAWL_API_KEY = "fc-key";
    vi.mocked(scrapeBrandDNA).mockResolvedValue({
      url: "https://sorensen-co.com",
      logoUrl: "https://sorensen-co.com/real-logo.png",
      primaryColor: "#123456",
      colors: {},
      creditsUsed: 5,
    });
    vi.stubGlobal("fetch", vi.fn(async () => imageOk()) as never);

    const spaHtml = `<link rel="icon" href="/vite.svg"><div id="root"></div>`;
    const { record } = await quickEnrich({
      place: { ...place, website: "https://sorensen-co.com" },
      industrySlug: "hvac",
      html: spaHtml,
    });

    expect(scrapeBrandDNA).toHaveBeenCalledTimes(1); // vite.svg not treated as logo
    expect(record.logo?.src_url).toBe("https://sorensen-co.com/real-logo.png");
  });
});

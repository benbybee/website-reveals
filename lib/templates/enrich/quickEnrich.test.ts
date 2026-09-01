import { describe, it, expect, vi, afterEach } from "vitest";

// Mock the Firecrawl branding fallback; both this test and quickEnrich import it
// by the same specifier, so the mock intercepts quickEnrich's call.
vi.mock("../../firecrawl", () => ({ scrapeBrandDNA: vi.fn() }));
import { scrapeBrandDNA } from "../../firecrawl";
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
});

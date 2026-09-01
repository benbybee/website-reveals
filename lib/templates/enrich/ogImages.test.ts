import { describe, it, expect } from "vitest";
import { extractSiteAssets } from "./ogImages";

const HTML = `
<!doctype html><html><head>
  <link rel="apple-touch-icon" href="/img/logo-180.png">
  <link rel="icon" href="/favicon.ico">
  <meta property="og:image" content="https://cdn.example.com/hero.jpg">
  <meta property="og:image:secure_url" content="https://cdn.example.com/hero.jpg">
</head><body>
  <img src="/photos/team.jpg" width="800" height="600" alt="team">
  <img src="data:image/gif;base64,R0lGOD" alt="inline">
  <img src="https://www.facebook.com/tr?id=1&ev=PageView" width="1" height="1">
  <img src="/icons/star.svg" width="16" height="16">
  <img src="https://cdn.example.com/service.png">
</body></html>`;

describe("extractSiteAssets", () => {
  it("extracts an absolutized logo (apple-touch-icon first)", () => {
    const { logoUrl } = extractSiteAssets(HTML, "https://example.com/");
    expect(logoUrl).toBe("https://example.com/img/logo-180.png");
  });

  it("extracts photos from og:image + content imgs, absolutized and de-duped", () => {
    const { photos } = extractSiteAssets(HTML, "https://example.com/");
    expect(photos).toContain("https://cdn.example.com/hero.jpg");
    expect(photos).toContain("https://example.com/photos/team.jpg");
    expect(photos).toContain("https://cdn.example.com/service.png");
    // og:image + og:image:secure_url are the same URL → de-duped
    expect(photos.filter((p) => p === "https://cdn.example.com/hero.jpg")).toHaveLength(1);
  });

  it("drops data-URIs, tracking pixels, and tiny icons", () => {
    const { photos } = extractSiteAssets(HTML, "https://example.com/");
    expect(photos.some((p) => p.startsWith("data:"))).toBe(false);
    expect(photos.some((p) => p.includes("facebook.com/tr"))).toBe(false);
    expect(photos.some((p) => p.includes("star.svg"))).toBe(false); // 16px icon
  });

  it("falls back to og:logo then favicon when no apple-touch-icon", () => {
    const html = `<link rel="icon" href="/favicon.ico">
      <meta property="og:logo" content="https://cdn.example.com/brand.png">`;
    const { logoUrl } = extractSiteAssets(html, "https://example.com/");
    expect(logoUrl).toBe("https://cdn.example.com/brand.png"); // og:logo beats favicon
  });

  it("returns no logo and empty photos for asset-free HTML", () => {
    const out = extractSiteAssets("<html><body><p>hi</p></body></html>", "https://example.com/");
    expect(out.logoUrl).toBeUndefined();
    expect(out.photos).toEqual([]);
  });
});

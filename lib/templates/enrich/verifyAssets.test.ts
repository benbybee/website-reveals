import { describe, it, expect, vi, afterEach } from "vitest";
import { verifyAssets } from "./verifyAssets";
import type { CanonicalRecord } from "../types";

afterEach(() => vi.restoreAllMocks());

function imageResponse() {
  return new Response(null, { status: 200, headers: { "content-type": "image/jpeg" } });
}
function htmlResponse() {
  return new Response(null, { status: 200, headers: { "content-type": "text/html" } });
}
function notFound() {
  return new Response(null, { status: 404 });
}

const base: CanonicalRecord = {
  source_id: "wr-tpl-x",
  business_name: "Joe",
  industry_slug: "home-services",
  address: { street: "1 Main", city: "Mesa", state: "AZ", zip: "85201", country: "US" },
  phone: "+14805551234",
  logo: { src_url: "https://x/logo.png" },
  photos: [
    { slot: "hero", src_url: "https://x/good.jpg" },
    { slot: "about", src_url: "https://x/dead.jpg" },
    { slot: "service-1", src_url: "https://x/login.html" },
  ],
};

describe("verifyAssets", () => {
  it("keeps live image URLs and drops dead / non-image ones", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("logo.png")) return imageResponse();
      if (url.includes("good.jpg")) return imageResponse();
      if (url.includes("dead.jpg")) return notFound();
      return htmlResponse(); // login.html
    });
    vi.stubGlobal("fetch", fetchMock as never);

    const out = await verifyAssets(base);

    expect(out.logo?.src_url).toBe("https://x/logo.png");
    expect(out.photos?.map((p) => p.src_url)).toEqual(["https://x/good.jpg"]);
  });

  it("drops a logo that fails verification", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => notFound()) as never);
    const out = await verifyAssets({ ...base, photos: [] });
    expect(out.logo).toBeUndefined();
  });
});

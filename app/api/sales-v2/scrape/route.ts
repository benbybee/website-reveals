import { NextRequest, NextResponse } from "next/server";
import { requireSalesRepAuth } from "@/lib/sales-rep-auth";
import { scrapeBusinessSite } from "@/lib/firecrawl";

/**
 * POST /api/sales-v2/scrape
 * Body: { url: string }
 *
 * Auth: sales rep cookie required (prevents abuse — Firecrawl scrapes cost
 *       credits). If you want to call this from admin tooling, swap to
 *       requireAdmin or accept either.
 *
 * Response: ScrapeResult shape (see lib/firecrawl.ts)
 */
export async function POST(req: NextRequest) {
  const auth = await requireSalesRepAuth();
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const url = typeof (body as { url?: unknown }).url === "string" ? (body as { url: string }).url.trim() : "";
  if (!url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  // Normalize: prepend https:// if user typed bare domain
  let normalized = url;
  if (!/^https?:\/\//i.test(normalized)) {
    normalized = `https://${normalized}`;
  }

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return NextResponse.json({ error: "URL must be http or https" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: `Invalid URL: ${url}` }, { status: 400 });
  }

  try {
    const result = await scrapeBusinessSite(normalized);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[sales-v2/scrape] failed:", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

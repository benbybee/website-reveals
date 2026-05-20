/**
 * One-off: hits Firecrawl directly the same way lib/firecrawl.ts does and
 * prints what /sales-v2 would surface to the rep (logo, colors, image count,
 * services, contact). DOES NOT submit to SL — read-only sanity check.
 *
 * Usage: node scripts/test-firecrawl-scrape.mjs <url> [<url> ...]
 */
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

const apiKey = env.FIRECRAWL_API_KEY;
if (!apiKey) {
  console.error("FIRECRAWL_API_KEY missing from .env.local");
  process.exit(1);
}

const BUSINESS_JSON_SCHEMA = {
  type: "object",
  properties: {
    business_name: { type: "string" },
    tagline: { type: "string" },
    phone: { type: "string" },
    email: { type: "string" },
    address: { type: "string" },
    service_areas: { type: "array", items: { type: "string" } },
    services: { type: "array", items: { type: "string" } },
    social_media: {
      type: "object",
      properties: {
        facebook: { type: "string" },
        instagram: { type: "string" },
        twitter: { type: "string" },
        linkedin: { type: "string" },
        youtube: { type: "string" },
      },
    },
    hero_image_url: { type: "string" },
    gallery_image_urls: { type: "array", items: { type: "string" } },
    about_text: { type: "string" },
    testimonials: {
      type: "array",
      items: {
        type: "object",
        properties: { quote: { type: "string" }, author: { type: "string" } },
      },
    },
  },
  required: ["business_name"],
};

async function scrape(url) {
  const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      formats: [
        "branding",
        {
          type: "json",
          prompt:
            "Extract business contact and content info from this website. Return only what's explicitly on the site, not inferred. For services, list the actual offerings the business provides, not navigation labels.",
          schema: BUSINESS_JSON_SCHEMA,
        },
      ],
      onlyMainContent: false,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  const body = await res.json();
  if (body.success === false) {
    throw new Error(`success=false  ${body.code || ""}  ${body.error || ""}`);
  }
  return body.data || {};
}

function reportColor(hex) {
  if (typeof hex !== "string") return "  (none)";
  const valid = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(hex);
  return `${hex}  ${valid ? "✓ valid hex" : "✗ INVALID"}`;
}

function reportUrl(u) {
  if (typeof u !== "string") return "  (none)";
  try {
    const parsed = new URL(u);
    return `${parsed.protocol === "https:" ? "✓ https" : "✗ " + parsed.protocol} ${u.slice(0, 100)}`;
  } catch {
    return `✗ invalid URL: ${u.slice(0, 100)}`;
  }
}

const urls = process.argv.slice(2);
if (urls.length === 0) {
  console.error("Usage: node scripts/test-firecrawl-scrape.mjs <url> [<url> ...]");
  process.exit(1);
}

for (const url of urls) {
  console.log("\n" + "=".repeat(80));
  console.log(`URL: ${url}`);
  console.log("=".repeat(80));
  try {
    const t0 = Date.now();
    const data = await scrape(url);
    const ms = Date.now() - t0;
    const b = data.branding || {};
    const j = data.json || {};
    const colors = b.colors || {};

    console.log(`  Took ${ms}ms · credits=${data.metadata?.creditsUsed || "?"}`);
    console.log(`  Confidence: overall=${b.confidence?.overall ?? "?"} colors=${b.confidence?.colors ?? "?"}`);

    console.log("\n  ─── Business ───────────────────────");
    console.log(`    name:    ${j.business_name || "(none)"}`);
    console.log(`    email:   ${j.email || "(none)"}`);
    console.log(`    phone:   ${j.phone || "(none)"}`);
    console.log(`    address: ${(j.address || "").slice(0, 80) || "(none)"}`);
    console.log(`    areas:   ${(j.service_areas || []).slice(0, 5).join(", ") || "(none)"}`);
    console.log(`    services (${(j.services || []).length}): ${(j.services || []).slice(0, 5).join(", ")}${(j.services || []).length > 5 ? "…" : ""}`);

    console.log("\n  ─── Logo ───────────────────────────");
    console.log(`    ${reportUrl(b.images?.logo)}`);

    console.log("\n  ─── Colors ─────────────────────────");
    for (const role of ["primary", "secondary", "accent", "background", "textPrimary", "link"]) {
      console.log(`    ${role.padEnd(13)} ${reportColor(colors[role])}`);
    }

    console.log("\n  ─── Images ─────────────────────────");
    console.log(`    hero:    ${reportUrl(j.hero_image_url)}`);
    const gallery = j.gallery_image_urls || [];
    console.log(`    gallery: ${gallery.length} URLs`);
    for (const u of gallery.slice(0, 5)) {
      console.log(`             ${reportUrl(u)}`);
    }
    if (gallery.length > 5) console.log(`             … +${gallery.length - 5} more`);

    console.log("\n  ─── Fonts ──────────────────────────");
    for (const f of (b.fonts || []).slice(0, 4)) {
      console.log(`    ${f.role || "?"}: ${f.family}`);
    }
  } catch (err) {
    console.log(`  ✗ FAILED: ${err.message}`);
  }
}

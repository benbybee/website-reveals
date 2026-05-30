/**
 * Task 3.2 — fixture-capture spike. Runs each Apify actor ONCE against a tiny
 * query and writes the raw JSON responses to lib/templates/__fixtures__/*.json.
 * These fixtures are the source of truth for every mapper test — we never invent
 * Apify/Facebook response shapes.
 *
 * SPENDS REAL APIFY CREDITS. Run only with explicit approval. Keeps result
 * counts tiny (3 places, 1 site each for audit actors).
 *
 * Usage:  node scripts/templates/capture-fixtures.mjs [--only=places,facebook,techstack,lighthouse]
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split("\n")
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => {
        const idx = l.indexOf("=");
        return [l.slice(0, idx).trim(), l.slice(idx + 1).trim().replace(/^["']|["']$/g, "")];
      }),
  );
}

const env = { ...loadEnvFile(".env.local") };
const TOKEN = env.APIFY_TOKEN;
if (!TOKEN) {
  console.error("APIFY_TOKEN missing from .env.local");
  process.exit(1);
}

const onlyArg = process.argv.find((a) => a.startsWith("--only="));
const only = onlyArg ? new Set(onlyArg.slice("--only=".length).split(",")) : null;
const want = (k) => !only || only.has(k);

const argVal = (name) => {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : null;
};
const siteOverride = argVal("site");
const fbOverride = argVal("fb");

const FIXTURE_DIR = "lib/templates/__fixtures__";
mkdirSync(FIXTURE_DIR, { recursive: true });

const BASE = "https://api.apify.com/v2";

async function runActor(actorId, input) {
  const path = actorId.replace("/", "~");
  const url = `${BASE}/acts/${path}/run-sync-get-dataset-items?token=${encodeURIComponent(TOKEN)}`;
  console.log(`  → running ${actorId} …`);
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const text = await res.text();
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`${actorId} → ${res.status}: ${text.slice(0, 300)}`);
  }
  const items = text ? JSON.parse(text) : [];
  return { items: Array.isArray(items) ? items : [], runId: res.headers.get("x-apify-run-id") };
}

function save(name, data) {
  const p = `${FIXTURE_DIR}/${name}.json`;
  writeFileSync(p, JSON.stringify(data, null, 2));
  console.log(`  ✔ wrote ${p} (${Array.isArray(data) ? data.length : "?"} items)`);
}

const captured = {};

// 1) Places — keystone fixture.
let placesItems = [];
if (want("places")) {
  console.log("[places] compass/crawler-google-places");
  const { items } = await runActor("compass/crawler-google-places", {
    searchStringsArray: ["pest control"],
    locationQuery: "Gilbert, AZ",
    maxCrawledPlacesPerSearch: 3,
    language: "en",
    skipClosedPlaces: false,
  });
  placesItems = items;
  save("places", items);
  captured.places = items.length;
}

// Derive real URLs from the places result for the dependent actors.
const firstWithSite = placesItems.find((p) => p && typeof p.website === "string" && p.website);
const siteUrl = siteOverride || firstWithSite?.website || "https://www.example-pestcontrol.com";
const fbUrl =
  fbOverride ||
  placesItems.map((p) => p?.facebook || p?.facebooks?.[0]).find((u) => typeof u === "string" && u) ||
  null;

// 2) Tech-stack — needs a real site URL.
if (want("techstack")) {
  console.log(`[techstack] accurate_pouch/tech-stack-detector  (url=${siteUrl})`);
  try {
    const { items } = await runActor("accurate_pouch/tech-stack-detector", {
      urls: [siteUrl],
    });
    save("techstack", items);
    captured.techstack = items.length;
  } catch (e) {
    console.warn(`  ! techstack capture skipped: ${e.message}`);
  }
}

// 3) Lighthouse — needs a real site URL.
if (want("lighthouse")) {
  console.log(`[lighthouse] nexgendata/google-lighthouse-checker  (url=${siteUrl})`);
  try {
    const { items } = await runActor("nexgendata/google-lighthouse-checker", {
      urls: [siteUrl],
      device: "desktop",
    });
    save("lighthouse", items);
    captured.lighthouse = items.length;
  } catch (e) {
    console.warn(`  ! lighthouse capture skipped: ${e.message}`);
  }
}

// 4) Facebook — actor unspecified in design; using the canonical pages scraper.
if (want("facebook")) {
  if (!fbUrl) {
    console.warn("  ! no facebook URL found in places result — skipping facebook fixture");
  } else {
    console.log(`[facebook] apify/facebook-pages-scraper  (url=${fbUrl})`);
    try {
      const { items } = await runActor("apify/facebook-pages-scraper", {
        startUrls: [{ url: fbUrl }],
        resultsLimit: 1,
      });
      save("facebook", items);
      captured.facebook = items.length;
    } catch (e) {
      console.warn(`  ! facebook capture skipped: ${e.message}`);
    }
  }
}

console.log("\nCapture summary:", JSON.stringify(captured));

/**
 * Read-only: dump the brand-DNA-relevant fields for the prospects of the most
 * recent campaign so we can confirm the Firecrawl enrichment actually landed
 * (logo + primary color) and see which prospects had a website to scrape.
 */
import { createClient } from "@supabase/supabase-js";
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
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const campaignId = process.argv[2];
let cid = campaignId;
if (!cid) {
  const { data: c } = await db
    .from("tpl_campaigns")
    .select("id, industry_slug")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  cid = c?.id;
  console.log(`(no campaign id passed — using latest: ${c?.industry_slug} ${cid})\n`);
}

const { data: prospects } = await db
  .from("tpl_prospects")
  .select("business_name, website, website_status, stage, record")
  .eq("campaign_id", cid)
  .order("business_name", { ascending: true });

for (const p of prospects || []) {
  const r = p.record || {};
  console.log("---");
  console.log(`  ${p.business_name}  [${p.stage}]`);
  console.log(`    website:        ${p.website || "—"} (${p.website_status})`);
  console.log(`    logo:           ${r.logo?.src_url || "—"}`);
  console.log(`    brand_colors:   ${r.brand_colors ? JSON.stringify(r.brand_colors) : "—"}`);
  console.log(`    sources:        ${JSON.stringify(r.sources || [])}`);
}
console.log("");

/**
 * Read-only: aggregate brand-DNA coverage stats for a campaign so we can see
 * WHERE the pipeline dropped DNA (no website vs. scraped-but-empty vs. never
 * enriched). Usage: node scripts/templates/diagnose-dna-stats.mjs [campaignId]
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

let cid = process.argv[2];
if (!cid) {
  const { data: c } = await db
    .from("tpl_campaigns")
    .select("id, industry_slug, status, scraped_count, qualified_count, incomplete_count, created_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  cid = c?.id;
  console.log(`(latest campaign: ${c?.industry_slug} ${cid} status=${c?.status} scraped=${c?.scraped_count} qualified=${c?.qualified_count} incomplete=${c?.incomplete_count})\n`);
}

// Page through all prospects (supabase caps selects at 1000 by default, fine for 400)
const { data: prospects, error } = await db
  .from("tpl_prospects")
  .select("business_name, website, website_status, stage, record")
  .eq("campaign_id", cid);
if (error) { console.error(error); process.exit(1); }

const total = prospects.length;
const byStage = {};
let withSite = 0, withLogo = 0, withColors = 0, withFirecrawlSource = 0;
let siteButNoDna = 0, siteAndDna = 0;
const siteNoDnaSamples = [];

for (const p of prospects) {
  byStage[p.stage] = (byStage[p.stage] || 0) + 1;
  const r = p.record || {};
  const hasSite = !!p.website;
  const hasLogo = !!r.logo?.src_url;
  const hasColors = !!r.brand_colors;
  const fcSource = (r.sources || []).includes("firecrawl");
  if (hasSite) withSite++;
  if (hasLogo) withLogo++;
  if (hasColors) withColors++;
  if (fcSource) withFirecrawlSource++;
  if (hasSite && (hasLogo || hasColors)) siteAndDna++;
  if (hasSite && !hasLogo && !hasColors) {
    siteButNoDna++;
    if (siteNoDnaSamples.length < 15)
      siteNoDnaSamples.push(`${p.business_name} [${p.stage}] ${p.website} (${p.website_status}) sources=${JSON.stringify(r.sources || [])}`);
  }
}

console.log(`total prospects:            ${total}`);
console.log(`stages:                     ${JSON.stringify(byStage)}`);
console.log(`with website:               ${withSite}`);
console.log(`with logo:                  ${withLogo}`);
console.log(`with brand_colors:          ${withColors}`);
console.log(`sources includes firecrawl: ${withFirecrawlSource}`);
console.log(`website AND dna:            ${siteAndDna}`);
console.log(`website but NO dna:         ${siteButNoDna}`);
console.log(`\nsamples (website but no DNA):`);
for (const s of siteNoDnaSamples) console.log(`  - ${s}`);

/**
 * Read-only diagnostic for the Apify discover/enrich pipeline. Shows recent
 * campaigns, their prospect counts by stage, and recent cost events (a discover
 * run writes one cost event per location, so it reveals whether the actor
 * actually executed and how many items it returned).
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

const { data: campaigns } = await db
  .from("tpl_campaigns")
  .select("id, industry_slug, locations, status, scraped_count, qualified_count, target_count, created_at, updated_at")
  .order("updated_at", { ascending: false })
  .limit(5);

console.log("\n=== Recent template campaigns ===\n");
for (const c of campaigns || []) {
  console.log("---");
  console.log(`  id:            ${c.id}`);
  console.log(`  industry_slug: ${c.industry_slug}`);
  console.log(`  locations:     ${JSON.stringify(c.locations)}`);
  console.log(`  status:        ${c.status}`);
  console.log(`  target_count:  ${c.target_count}`);
  console.log(`  scraped_count: ${c.scraped_count}`);
  console.log(`  updated_at:    ${c.updated_at}`);

  const { data: ind } = await db
    .from("tpl_industries")
    .select("slug, google_categories, sl_slug")
    .eq("slug", c.industry_slug)
    .maybeSingle();
  console.log(`  industry row:  ${ind ? `categories=${JSON.stringify(ind.google_categories)}` : "❌ NO tpl_industries ROW (falls back to industry_slug as search term)"}`);

  const { count: pCount } = await db
    .from("tpl_prospects")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", c.id);
  console.log(`  prospects:     ${pCount ?? 0}`);

  const { data: events } = await db
    .from("tpl_cost_events")
    .select("stage, actor, units, usd, run_id, created_at")
    .eq("campaign_id", c.id)
    .order("created_at", { ascending: false })
    .limit(6);
  if (events && events.length) {
    console.log("  cost events:");
    for (const e of events) {
      console.log(`    [${e.created_at}] ${e.stage}/${e.actor} units=${e.units} usd=${e.usd} run=${e.run_id ?? "—"}`);
    }
  } else {
    console.log("  cost events:   none (discover actor never recorded a run for this campaign)");
  }
}
console.log("");

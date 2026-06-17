/**
 * Diagnostic (read-only): show the most recent template-pipeline builds and the
 * SL build_error for any that landed in build_failed.
 * Usage: node scripts/templates/diagnose-build-failures.mjs
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

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const fmt = (s) => (s ? new Date(s).toLocaleString() : "—");

const { data, error } = await supabase
  .from("tpl_prospects")
  .select("id, business_name, stage, source_id, sl_build_id, preview_url, record, updated_at, campaign_id")
  .in("stage", ["building", "live", "build_failed", "approved", "qualified"])
  .order("updated_at", { ascending: false })
  .limit(25);

if (error) {
  console.error("Query failed:", error.message);
  process.exit(1);
}

// Stage tally across the whole board (not just the 25)
const { data: all } = await supabase
  .from("tpl_prospects")
  .select("stage");
const tally = {};
for (const r of all || []) tally[r.stage] = (tally[r.stage] || 0) + 1;
console.log("\n=== Stage tally (all prospects) ===\n");
console.table(tally);

console.log("\n=== 25 most-recently-updated prospects ===\n");
console.table(
  (data || []).map((p) => ({
    business: (p.business_name || "—").slice(0, 28),
    stage: p.stage,
    sl_build_id: p.sl_build_id ? String(p.sl_build_id).slice(0, 8) : "—",
    preview: p.preview_url ? "yes" : "—",
    updated: fmt(p.updated_at),
  })),
);

const failed = (data || []).filter((p) => p.stage === "build_failed");
console.log(`\n=== build_failed detail (${failed.length}) ===\n`);
for (const p of failed) {
  console.log(`• ${p.business_name || p.id}`);
  console.log(`    source_id:   ${p.source_id}`);
  console.log(`    sl_build_id: ${p.sl_build_id || "—"}`);
  console.log(`    build_error: ${p.record?.build_error || "(none recorded)"}`);
  console.log(`    updated:     ${fmt(p.updated_at)}`);
  console.log("");
}

// Also surface anything still stuck in `building` (dispatched, no terminal callback)
const building = (data || []).filter((p) => p.stage === "building");
if (building.length) {
  console.log(`=== still building (${building.length}) — dispatched, awaiting terminal callback ===\n`);
  for (const p of building) {
    console.log(`• ${p.business_name || p.id}  (sl_build_id ${p.sl_build_id || "—"}, updated ${fmt(p.updated_at)})`);
  }
  console.log("");
}

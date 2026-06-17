/**
 * Reconciliation probe (read-only): for every tpl_prospects row stuck in
 * `building`, GET SL's authoritative build status and print it. Reveals lost
 * callbacks (SL says succeeded/failed but WR still shows building).
 * Usage: node scripts/templates/check-sl-build.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";

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
const base = (env.SL_TEMPLATE_BUILD_URL || env.SITELAUNCHR_API_URL || "").trim().replace(/\/+$/, "");
const apiKey = (env.SL_TEMPLATE_API_KEY || "").trim();
const secret = (env.SL_TEMPLATE_HMAC_SECRET || "").trim();

const { data } = await supabase
  .from("tpl_prospects")
  .select("business_name, source_id, sl_build_id, stage, updated_at")
  .eq("stage", "building");

if (!data || !data.length) {
  console.log("No rows stuck in `building`.");
  process.exit(0);
}

for (const r of data) {
  console.log(`\n=== ${r.business_name} ===`);
  console.log(`  source_id:   ${r.source_id}`);
  console.log(`  sl_build_id: ${r.sl_build_id || "—"}  (WR stage=${r.stage}, since ${new Date(r.updated_at).toLocaleString()})`);
  if (!r.sl_build_id) { console.log("  (no sl_build_id — cannot query SL)"); continue; }
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = createHmac("sha256", secret).update(`${ts}.`).digest("hex"); // empty-body GET
  const url = `${base}/${encodeURIComponent(r.sl_build_id)}`;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "x-source-id": "wr-template", "x-api-key": apiKey, "x-timestamp": ts, "x-signature": sig },
    });
    const text = await res.text();
    console.log(`  SL GET ${res.status}: ${text}`);
  } catch (e) {
    console.log(`  SL GET error: ${e instanceof Error ? e.message : String(e)}`);
  }
}

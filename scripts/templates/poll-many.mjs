/**
 * Poll several tpl_prospects rows by source_id until each reaches a terminal
 * state (live / build_failed) or timeout. Reports each as it resolves.
 * Usage: node scripts/templates/poll-many.mjs <sid1,sid2,...> [maxSeconds]
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
const ids = (process.argv[2] || "").split(",").map((s) => s.trim()).filter(Boolean);
const maxSeconds = Number(process.argv[3] || 720);
if (!ids.length) { console.error("need comma-separated source_ids"); process.exit(1); }

const sel = "business_name, source_id, stage, preview_url, updated_at, record";
const done = {};
const started = Date.now();

async function snapshot() {
  const { data } = await supabase.from("tpl_prospects").select(sel).in("source_id", ids);
  return data || [];
}

for (const r of await snapshot()) console.log(`[start] ${r.business_name}: stage=${r.stage}`);

// eslint-disable-next-line no-constant-condition
while (true) {
  await new Promise((r) => setTimeout(r, 20000));
  const elapsed = Math.round((Date.now() - started) / 1000);
  const rows = await snapshot();
  for (const r of rows) {
    if (done[r.source_id]) continue;
    if (r.stage === "live") {
      done[r.source_id] = "live";
      console.log(`[+${elapsed}s] ✅ LIVE  ${r.business_name}  ${r.preview_url}`);
    } else if (r.stage === "build_failed") {
      done[r.source_id] = "failed";
      console.log(`[+${elapsed}s] ❌ FAILED ${r.business_name}  err=${(r.record?.build_error || "").slice(0, 90)}`);
    }
  }
  const remaining = ids.filter((id) => !done[id]);
  if (!remaining.length) { console.log(`\nAll ${ids.length} terminal.`); break; }
  if ((Date.now() - started) / 1000 > maxSeconds) {
    const names = rows.filter((r) => !done[r.source_id]).map((r) => `${r.business_name}=${r.stage}`);
    console.log(`\n⏳ TIMEOUT ${maxSeconds}s. Still in flight: ${names.join(", ")}`);
    break;
  }
}

const live = Object.values(done).filter((s) => s === "live").length;
const failed = Object.values(done).filter((s) => s === "failed").length;
console.log(`\nSummary: ${live} live, ${failed} failed, ${ids.length - live - failed} unresolved`);

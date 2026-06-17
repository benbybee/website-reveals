/**
 * Poll a single tpl_prospects row by source_id until its build reaches a NEW
 * terminal state (live, or a fresh build_failed), or timeout.
 * Usage: node scripts/templates/poll-one.mjs <source_id> [maxSeconds]
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
const sourceId = process.argv[2];
const maxSeconds = Number(process.argv[3] || 480);
if (!sourceId) { console.error("need source_id"); process.exit(1); }

const sel = "business_name, stage, preview_url, updated_at, record";
const { data: base } = await supabase.from("tpl_prospects").select(sel).eq("source_id", sourceId).maybeSingle();
if (!base) { console.error("no row"); process.exit(1); }
const baseUpdated = base.updated_at;
console.log(`[poll] ${base.business_name}: start stage=${base.stage} updated=${baseUpdated}`);

const started = Date.now();
const intervalMs = 20000;
// eslint-disable-next-line no-constant-condition
while (true) {
  await new Promise((r) => setTimeout(r, intervalMs));
  const { data } = await supabase.from("tpl_prospects").select(sel).eq("source_id", sourceId).maybeSingle();
  const elapsed = Math.round((Date.now() - started) / 1000);
  const changed = data.updated_at !== baseUpdated;
  console.log(`[poll +${elapsed}s] stage=${data.stage} changed=${changed} preview=${data.preview_url ? "yes" : "—"}`);
  if (data.stage === "live") {
    console.log(`\n✅ LIVE — ${data.business_name}\n   preview_url: ${data.preview_url}`);
    process.exit(0);
  }
  if (data.stage === "build_failed" && changed) {
    console.log(`\n❌ RE-FAILED — ${data.business_name}\n   build_error: ${data.record?.build_error || "(none)"}`);
    process.exit(2);
  }
  if ((Date.now() - started) / 1000 > maxSeconds) {
    console.log(`\n⏳ TIMEOUT after ${maxSeconds}s — stage=${data.stage} (still in flight; check again later)`);
    process.exit(3);
  }
}

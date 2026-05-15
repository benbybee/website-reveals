/**
 * Diagnostic: show the most recent /sales submission and its SL build status.
 * Usage: node scripts/sl-status.mjs
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

function fmt(s) {
  if (!s) return "—";
  return new Date(s).toLocaleString();
}

// Most recent submissions from the sales source
const { data: sessions, error: e1 } = await supabase
  .from("form_sessions")
  .select("token, email, form_data, submitted_at, created_at")
  .not("submitted_at", "is", null)
  .order("submitted_at", { ascending: false })
  .limit(5);

if (e1) {
  console.error("Sessions query failed:", e1.message);
  process.exit(1);
}

console.log("\n=== 5 most recent submissions ===\n");
console.table(
  (sessions || []).map((s) => ({
    business: s.form_data?.business_name || "—",
    source: s.form_data?._source || "claim-your-site",
    industry: s.form_data?.industry || "—",
    contact_email: s.form_data?.contact_email || "—",
    submitted: fmt(s.submitted_at),
    token: s.token.slice(0, 8),
  })),
);

// Latest build_jobs rows (any pipeline) — wide select
const { data: jobs, error: e2 } = await supabase
  .from("build_jobs")
  .select(
    "id, token, pipeline, status, sl_build_id, sl_phase, sl_phase_at, sl_running_at, sl_live_at, site_url, wp_admin_url, kura_portal_url, cost_usd, error, created_at, started_at, completed_at",
  )
  .order("created_at", { ascending: false })
  .limit(5);

if (e2) {
  console.error("Build jobs query failed:", e2.message);
  process.exit(1);
}

console.log("\n=== 5 most recent build_jobs ===\n");
console.table(
  (jobs || []).map((j) => ({
    id: j.id.slice(0, 8),
    pipeline: j.pipeline || "?",
    status: j.status,
    sl_phase: j.sl_phase || "—",
    sl_build_id: j.sl_build_id ? j.sl_build_id.slice(0, 8) : "—",
    created: fmt(j.created_at),
    sl_phase_at: fmt(j.sl_phase_at),
    cost: j.cost_usd != null ? `$${Number(j.cost_usd).toFixed(2)}` : "—",
    error: j.error ? String(j.error).slice(0, 60) : "—",
    site: j.site_url ? j.site_url.slice(0, 50) : "—",
  })),
);

// Focus on the very latest SL job
const slJob = (jobs || []).find((j) => j.pipeline === "sitelaunchr");
if (slJob) {
  console.log("\n=== Latest SiteLaunchr job — full detail ===\n");
  console.log(JSON.stringify(slJob, null, 2));
} else {
  console.log("\n=== No SiteLaunchr-pipeline build_jobs found ===\n");
}

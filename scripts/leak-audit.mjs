/**
 * For each leaky live SL build, pull the form_session's REAL business contact
 * info (vs the sales rep's contact info that's currently on the public site).
 * Output is meant to be handed straight to the SL agent for the surgical fix.
 *
 * Usage: node scripts/leak-audit.mjs
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

// Pull every SiteLaunchr build_jobs row that reached live or deployed phase
const { data: builds } = await supabase
  .from("build_jobs")
  .select("id, token, sl_build_id, sl_phase, site_url, form_sessions:form_sessions!token(form_data)")
  .eq("pipeline", "sitelaunchr")
  .in("sl_phase", ["live", "succeeded"])
  .order("created_at", { ascending: false });

const rows = (builds || []).map((b) => {
  const fd = ((b.form_sessions || {}).form_data) || {};
  const isSales = fd._source === "sales";
  return {
    sl_build_id_8: (b.sl_build_id || "").slice(0, 8),
    business: fd.business_name || "—",
    source: fd._source || "—",
    rep_contact_email: isSales ? (fd.contact_email || "—") : "(n/a non-sales)",
    rep_contact_phone: isSales ? (fd.contact_phone || "—") : "(n/a non-sales)",
    business_email: fd.email || "(MISSING)",
    business_phone: fd.phone || "(MISSING)",
    site_url: b.site_url || "—",
    token_full: b.token,
    sl_build_id_full: b.sl_build_id,
  };
});

console.log("\n=== SiteLaunchr builds that reached succeeded/live ===\n");
console.table(
  rows.map((r) => ({
    sl_build_id: r.sl_build_id_8,
    business: r.business,
    source: r.source,
    rep_email: r.rep_contact_email,
    biz_email: r.business_email,
    biz_phone: r.business_phone,
  })),
);

// Filter to sales-only — those are the ones leaking
const leaky = rows.filter((r) => r.source === "sales");
if (leaky.length === 0) {
  console.log("\n(no sales-source builds — nothing leaking)");
  process.exit(0);
}

console.log(`\n=== ${leaky.length} sales builds — REAL contact pairs for SL surgical fix ===\n`);
for (const r of leaky) {
  console.log(`sl_build_id: ${r.sl_build_id_full}`);
  console.log(`  business:        ${r.business}`);
  console.log(`  site:            ${r.site_url}`);
  console.log(`  REP (REMOVE):    email=${r.rep_contact_email}  phone=${r.rep_contact_phone}`);
  console.log(`  BIZ (REPLACE):   email=${r.business_email}      phone=${r.business_phone}`);
  console.log("");
}

// d8c339db check
const { data: d8 } = await supabase
  .from("form_sessions")
  .select("token, form_data, submitted_at")
  .like("token", "d8c339db%")
  .maybeSingle();
if (d8) {
  const { data: bj } = await supabase
    .from("build_jobs")
    .select("id, pipeline, sl_build_id, sl_phase, status")
    .eq("token", d8.token)
    .maybeSingle();
  console.log("=== d8c339db status ===");
  console.log(`  full token:   ${d8.token}`);
  console.log(`  submitted_at: ${d8.submitted_at}`);
  console.log(`  business:     ${d8.form_data?.business_name}`);
  console.log(`  source:       ${d8.form_data?._source}`);
  console.log(`  build_jobs:   ${bj ? `EXISTS (pipeline=${bj.pipeline}, sl_build_id=${bj.sl_build_id || "—"})` : "NONE — never dispatched"}`);
}

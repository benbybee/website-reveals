/**
 * Show which sales submissions have a dedicated client (form_session_token match)
 * vs which were collapsed onto the rep's shared client record.
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

const { data: sessions } = await supabase
  .from("form_sessions")
  .select("token, email, form_data, sales_rep_id, submitted_at")
  .not("submitted_at", "is", null)
  .order("submitted_at", { ascending: false });

const salesOnes = (sessions || []).filter(
  (s) => (s.form_data?._source) === "sales",
);

const rows = [];
for (const s of salesOnes) {
  const fd = s.form_data || {};
  const { data: matching } = await supabase
    .from("clients")
    .select("id, email, company_name")
    .eq("form_session_token", s.token)
    .maybeSingle();
  rows.push({
    business: fd.business_name || "—",
    rep_email: fd.contact_email || "—",
    biz_email: fd.email || "—",
    submitted: new Date(s.submitted_at).toLocaleString(),
    has_dedicated_client: matching ? "YES" : "NO",
    matched_client_id: matching ? matching.id.slice(0, 8) : "—",
    token: s.token.slice(0, 8),
  });
}

console.log(`\n=== Sales submissions (${salesOnes.length} total) ===\n`);
console.table(rows);

// Also count clients with merged email (sales rep emails appearing on multiple submissions)
const repEmailCounts = new Map();
for (const s of salesOnes) {
  const e = (s.form_data?.contact_email) || "";
  repEmailCounts.set(e, (repEmailCounts.get(e) || 0) + 1);
}
const dupReps = [...repEmailCounts.entries()].filter(([, n]) => n > 1);
if (dupReps.length > 0) {
  console.log("\nRep emails used on multiple sales submissions (these are the 'merged' clients):");
  for (const [e, n] of dupReps) console.log(`  ${e}: ${n} submissions`);
}

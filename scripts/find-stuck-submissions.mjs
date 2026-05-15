/**
 * Diagnostic: find form sessions that look like attempted submissions
 * but were never marked submitted_at.
 *
 * Usage:
 *   node scripts/find-stuck-submissions.mjs
 *   node scripts/find-stuck-submissions.mjs --recent  (shows recent submitted ones too)
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

// Load .env.local manually
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim().replace(/^["']|["']$/g, "")];
    })
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(url, key);
const showRecent = process.argv.includes("--recent");

function fmt(s) {
  if (!s) return "—";
  const d = new Date(s);
  return d.toLocaleString();
}

function summarize(row) {
  const fd = row.form_data || {};
  return {
    token: row.token,
    started: fmt(row.created_at),
    submitted: fmt(row.submitted_at),
    business: fd.business_name || "—",
    contact_email: fd.contact_email || row.email || "—",
    contact_phone: fd.contact_phone || fd.phone || "—",
    current_step: row.current_step,
    fields_filled: Object.keys(fd).length,
  };
}

async function main() {
  console.log("=== Stuck submissions (form_data filled, never marked submitted) ===\n");
  const { data: stuck, error: e1 } = await supabase
    .from("form_sessions")
    .select("token,email,form_data,dns_provider,current_step,created_at,submitted_at")
    .is("submitted_at", null)
    .not("form_data", "is", null)
    .order("created_at", { ascending: false })
    .limit(30);

  if (e1) {
    console.error("Query failed:", e1.message);
    process.exit(1);
  }

  const real = (stuck || []).filter(
    (r) => r.form_data && Object.keys(r.form_data).length > 0
  );

  if (real.length === 0) {
    console.log("(none)\n");
  } else {
    console.table(real.map(summarize));
  }

  if (showRecent) {
    console.log("\n=== Recent successful submissions (last 10) ===\n");
    const { data: recent, error: e2 } = await supabase
      .from("form_sessions")
      .select("token,email,form_data,dns_provider,current_step,created_at,submitted_at")
      .not("submitted_at", "is", null)
      .order("submitted_at", { ascending: false })
      .limit(10);
    if (e2) {
      console.error("Query failed:", e2.message);
      process.exit(1);
    }
    if (!recent || recent.length === 0) {
      console.log("(none)\n");
    } else {
      console.table(recent.map(summarize));
    }
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});

/**
 * List submissions received in the last N hours.
 * Usage: node scripts/recent-submissions.mjs [hours=6]
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

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing Supabase env vars in .env.local");
  process.exit(1);
}

const hours = Number(process.argv[2] || 6);
const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

const supabase = createClient(url, key);

const { data: submitted, error: e1 } = await supabase
  .from("form_sessions")
  .select("token,email,form_data,dns_provider,submitted_at,created_at")
  .gte("submitted_at", since)
  .order("submitted_at", { ascending: false });
if (e1) {
  console.error("Query error:", e1.message);
  process.exit(1);
}

const { data: started, error: e2 } = await supabase
  .from("form_sessions")
  .select("token,email,form_data,submitted_at,created_at")
  .gte("created_at", since)
  .is("submitted_at", null)
  .order("created_at", { ascending: false });
if (e2) {
  console.error("Query error:", e2.message);
  process.exit(1);
}

console.log(`\n=== Submitted in the last ${hours}h (${submitted?.length || 0}) ===\n`);
if (!submitted || submitted.length === 0) {
  console.log("(none)\n");
} else {
  console.table(
    submitted.map((r) => {
      const fd = r.form_data || {};
      return {
        when: new Date(r.submitted_at).toLocaleString(),
        business: fd.business_name || "—",
        source: fd._source || "claim-your-site",
        contact_email: fd.contact_email || r.email || "—",
        contact_phone: fd.contact_phone || fd.phone || "—",
        token: r.token.slice(0, 8),
      };
    }),
  );
}

console.log(`\n=== Started but NOT submitted in the last ${hours}h (${started?.length || 0}) ===\n`);
if (!started || started.length === 0) {
  console.log("(none)\n");
} else {
  console.table(
    started.map((r) => {
      const fd = r.form_data || {};
      return {
        started: new Date(r.created_at).toLocaleString(),
        business: fd.business_name || "—",
        source: fd._source || "claim-your-site",
        contact_email: fd.contact_email || "—",
        fields_filled: Object.keys(fd || {}).filter((k) => !k.startsWith("_")).length,
        token: r.token.slice(0, 8),
      };
    }),
  );
}

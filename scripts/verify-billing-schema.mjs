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

const invoicesRes = await supabase.from("invoices").select("id").limit(1);
const buildJobsRes = await supabase
  .from("build_jobs")
  .select("id, cost_usd, input_tokens, output_tokens, invoice_id")
  .limit(1);

console.log("invoices table:", invoicesRes.error ? `❌ ${invoicesRes.error.message}` : "✅ exists & queryable");
console.log("build_jobs.cost_usd:", buildJobsRes.error ? `❌ ${buildJobsRes.error.message}` : "✅ columns present");

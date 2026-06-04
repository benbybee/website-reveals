/**
 * Walk the completion-email decision tree for the most recently completed
 * sales-rep task and show exactly which gate (if any) blocked the email.
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

// Notification settings
const { data: settings } = await supabase
  .from("notification_settings")
  .select("audience, enabled, updated_at");
console.log("\n=== notification_settings ===");
console.table(settings);

// Recent completions
const { data: history } = await supabase
  .from("task_status_history")
  .select("task_id, old_status, new_status, changed_by, notes, created_at")
  .eq("new_status", "complete")
  .order("created_at", { ascending: false })
  .limit(5);
console.log("\n=== Most recent 'complete' transitions ===");
console.table(history);

if (!history || history.length === 0) {
  console.log("(no recent completions found)");
  process.exit(0);
}

// Walk the decision tree for the most recent one
const latest = history[0];
console.log(`\n=== Walking completion path for task ${latest.task_id.slice(0, 8)} ===\n`);

const { data: task } = await supabase
  .from("tasks")
  .select("id, title, status, client_id, archived_at, completed_at")
  .eq("id", latest.task_id)
  .single();
console.log("task:", { ...task, id: task.id.slice(0, 8) });

if (!task.client_id) {
  console.log("❌ task.client_id is NULL — getClientById would return null, no email fires.");
  process.exit(0);
}

const { data: client } = await supabase
  .from("clients")
  .select("id, first_name, last_name, company_name, email, form_session_token, sales_rep_id")
  .eq("id", task.client_id)
  .single();
console.log("\nclient:", {
  id: client.id.slice(0, 8),
  first_name: client.first_name,
  email: client.email,
  form_session_token: client.form_session_token ? client.form_session_token.slice(0, 8) : null,
  sales_rep_id: client.sales_rep_id ? client.sales_rep_id.slice(0, 8) : null,
});

if (!client.form_session_token) {
  console.log("⚠️  client.form_session_token is NULL — audienceForClientId returns 'client' (not 'sales_rep')");
} else {
  const { data: session } = await supabase
    .from("form_sessions")
    .select("form_data")
    .eq("token", client.form_session_token)
    .maybeSingle();
  const src = session?.form_data?._source;
  console.log(`\nform_session._source: ${src} → audience: ${src === "sales" ? "sales_rep" : "client"}`);
}

const salesRepEnabled = (settings || []).find((s) => s.audience === "sales_rep")?.enabled;
console.log(`\nsales_rep notifications enabled: ${salesRepEnabled}`);

if (client.sales_rep_id) {
  const { data: rep } = await supabase
    .from("sales_reps")
    .select("id, email, first_name, active")
    .eq("id", client.sales_rep_id)
    .maybeSingle();
  console.log("\nsales_rep lookup:", rep);
  if (!rep) {
    console.log("❌ client.sales_rep_id points to a rep that doesn't exist → falls back to client.email");
  }
} else {
  console.log("\n❌ client.sales_rep_id is NULL → falls back to client.email");
  console.log(`   That fallback address: ${client.email}`);
  if (String(client.email).endsWith("@websitereveals.local")) {
    console.log("   ⚠️  Synthetic nomail address — Resend will silently drop or bounce.");
  }
}

// build_jobs for site URL
const { data: build } = await supabase
  .from("build_jobs")
  .select("id, site_url, wp_admin_url, sl_phase, status, task_id")
  .eq("task_id", task.id)
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();
console.log("\nlinked build_jobs row:", build);

// Recent audit entries for this task
const { data: audit } = await supabase
  .from("audit_log")
  .select("actor_type, actor_id, action, details, created_at")
  .eq("target_id", task.id)
  .order("created_at", { ascending: false })
  .limit(5);
console.log("\nrecent audit entries:");
console.table(audit);

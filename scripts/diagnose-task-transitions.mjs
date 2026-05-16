/**
 * For each recent sitelaunchr build_job, show: build state + task state +
 * recent task_status_history. Reveals whether auto-transitions are firing.
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

const { data: builds } = await supabase
  .from("build_jobs")
  .select("id, token, sl_build_id, sl_phase, status, task_id, sl_running_at, sl_live_at, created_at, form_sessions:form_sessions!token(form_data)")
  .eq("pipeline", "sitelaunchr")
  .order("created_at", { ascending: false })
  .limit(10);

console.log("\n=== Recent SiteLaunchr builds → linked task state ===\n");

for (const b of builds || []) {
  const businessName = (b.form_sessions?.form_data?.business_name) || "—";
  console.log(`---`);
  console.log(`  business:      ${businessName}`);
  console.log(`  sl_build_id:   ${(b.sl_build_id || "").slice(0, 8)}`);
  console.log(`  sl_phase:      ${b.sl_phase || "—"}`);
  console.log(`  build status:  ${b.status}`);
  console.log(`  task_id:       ${b.task_id ? b.task_id.slice(0, 8) : "❌ NULL — no task link!"}`);
  console.log(`  sl_running_at: ${b.sl_running_at || "—"}`);
  console.log(`  sl_live_at:    ${b.sl_live_at || "—"}`);

  if (b.task_id) {
    const { data: task } = await supabase
      .from("tasks")
      .select("id, title, status, updated_at")
      .eq("id", b.task_id)
      .maybeSingle();
    if (task) {
      console.log(`  task status:   ${task.status} (updated ${new Date(task.updated_at).toLocaleString()})`);
    } else {
      console.log(`  task status:   ⚠️  task_id set but task not found`);
    }
    const { data: history } = await supabase
      .from("task_status_history")
      .select("old_status, new_status, changed_by, created_at, notes")
      .eq("task_id", b.task_id)
      .order("created_at", { ascending: false })
      .limit(5);
    if (history && history.length > 0) {
      console.log(`  history:`);
      for (const h of history) {
        console.log(`    ${new Date(h.created_at).toLocaleString()}  ${h.old_status || "—"} → ${h.new_status}  by ${h.changed_by}${h.notes ? "  (" + h.notes.slice(0, 60) + ")" : ""}`);
      }
    } else {
      console.log(`  history:       (none)`);
    }
  }
}

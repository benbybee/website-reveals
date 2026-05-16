import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { sendTelegramMessage } from "@/lib/telegram";
import { logAudit } from "@/lib/audit-log";
import { notifyDispatchr } from "@/lib/dispatchr-webhook";

const STUCK_AFTER_MIN = 120; // 2h

/**
 * Vercel Cron: reconcile SiteLaunchr builds that appear stuck.
 *
 * Why this exists: SL retries callback delivery 6× over an hour. If our
 * endpoint was down or rate-limited during that window, the callback can
 * be lost forever and a build_jobs row sits in `building` indefinitely.
 *
 * What it does: every 2h, scan for build_jobs rows where:
 *   pipeline = 'sitelaunchr'
 *   sl_phase IN ('queued', 'running')
 *   created_at < now() - 120 min
 * For each one, mark status='failed' + sl_phase='reconciled_timeout',
 * record last_reconciled_at, and Telegram-alert the admin so they can
 * investigate (and optionally resubmit via the admin UI).
 *
 * Vercel calls this with a Bearer token (`VERCEL_CRON_SECRET`) we should
 * verify, OR `Authorization: Bearer <CRON_SECRET>` for self-hosted setups.
 */
export async function GET(req: NextRequest) {
  // Verify the call is from Vercel Cron (or our own admin testing)
  const authHeader = req.headers.get("authorization") || "";
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  // Otherwise allow — Vercel-managed crons hit the URL without a secret in their default config

  const supabase = createServerClient();
  const cutoff = new Date(Date.now() - STUCK_AFTER_MIN * 60_000).toISOString();

  const { data: stuck, error } = await supabase
    .from("build_jobs")
    .select(
      "id, token, sl_build_id, sl_phase, created_at, sl_running_at, form_sessions:form_sessions!token(form_data)",
    )
    .eq("pipeline", "sitelaunchr")
    .in("sl_phase", ["queued", "running"])
    .lt("created_at", cutoff);

  if (error) {
    console.error("[cron:reconcile-sl] Query failed:", error.message);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }
  if (!stuck || stuck.length === 0) {
    return NextResponse.json({ reconciled: 0 });
  }

  const ids = stuck.map((s) => s.id as string);
  const nowIso = new Date().toISOString();

  // Mark them all failed
  const { error: updErr } = await supabase
    .from("build_jobs")
    .update({
      status: "failed",
      sl_phase: "reconciled_timeout",
      error: `Reconciled: no callback received within ${STUCK_AFTER_MIN} min`,
      completed_at: nowIso,
      last_reconciled_at: nowIso,
    })
    .in("id", ids);

  if (updErr) {
    console.error("[cron:reconcile-sl] Update failed:", updErr.message);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  // Audit + Dispatchr alert per stuck build
  for (const job of stuck) {
    const fd =
      ((job.form_sessions as { form_data?: Record<string, unknown> } | null)?.form_data) || {};
    const businessName = (fd.business_name as string) || (job.token as string);
    void logAudit({
      actor_type: "system",
      actor_id: "cron:reconcile-sl",
      action: "build.reconciled_timeout",
      target_type: "build_job",
      target_id: job.id as string,
      details: {
        sl_build_id: job.sl_build_id,
        sl_phase: job.sl_phase,
        business: businessName,
        stuck_since: job.created_at,
      },
    });
    const createdAtMs = new Date(job.created_at as string).getTime();
    const ageHours = Math.round((Date.now() - createdAtMs) / 3_600_000);
    await notifyDispatchr({
      type: "build.stuck",
      token: job.token as string,
      businessName,
      buildId: (job.sl_build_id as string) || "",
      ageHours,
    });
  }

  try {
    const lines = [
      `⚠️ SL Reconciliation: marked ${stuck.length} build${stuck.length === 1 ? "" : "s"} as failed`,
      ``,
      ...stuck.slice(0, 5).map((s) => {
        const fd =
          ((s.form_sessions as { form_data?: Record<string, unknown> } | null)?.form_data) || {};
        return `• ${(fd.business_name as string) || s.token} (${(s.sl_build_id as string)?.slice(0, 8) || "no-id"})`;
      }),
    ];
    if (stuck.length > 5) lines.push(`… and ${stuck.length - 5} more`);
    await sendTelegramMessage(lines.join("\n"));
  } catch (tgErr) {
    console.error("[cron:reconcile-sl] Telegram alert failed:", tgErr);
  }

  return NextResponse.json({ reconciled: stuck.length, ids });
}

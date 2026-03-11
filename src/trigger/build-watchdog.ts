/**
 * Build Watchdog — scheduled Trigger.dev task
 *
 * Runs every 30 minutes. Detects stuck build jobs, attempts auto-recovery
 * (worker restart + resubmit), and sends Telegram alerts when human
 * intervention is needed.
 *
 * Stuck thresholds:
 *   queued   > 20 min  → restart worker + resubmit
 *   building > 45 min  → flag potentially stuck (alert only, don't cancel)
 *   building > 90 min  → mark failed + resubmit
 */

import { schedules } from "@trigger.dev/sdk/v3";
import { createClient } from "@supabase/supabase-js";
import { spawn } from "child_process";
import { sendTelegramMessage } from "../../lib/telegram";

const WEBHOOK_URL = "https://www.websitereveals.com/api/webhooks/submit";
const WEBHOOK_API_KEY = process.env.WEBHOOK_API_KEY!;

// Minutes before we consider a job stuck
const QUEUED_STUCK_MIN = 20;
const BUILDING_WARN_MIN = 45;
const BUILDING_FAILED_MIN = 90;

// Max consecutive resubmits before we give up and alert
const MAX_RESUBMITS = 3;

export const buildWatchdog = schedules.task({
  id: "build-watchdog",
  // Run every 30 minutes
  cron: "*/30 * * * *",
  maxDuration: 120,
  run: async () => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const now = new Date();
    const alerts: string[] = [];
    const actions: string[] = [];

    // ── 1. Find stuck jobs ────────────────────────────────────────────────────
    const { data: activeJobs, error } = await supabase
      .from("build_jobs")
      .select("id, token, status, created_at, started_at, error, resubmit_count")
      .in("status", ["queued", "building"])
      .order("created_at", { ascending: true });

    if (error) {
      await sendTelegramMessage(
        `⚠️ *Build Watchdog Error*\nFailed to query build_jobs: ${error.message}`
      ).catch(() => {});
      return;
    }

    if (!activeJobs || activeJobs.length === 0) {
      // Nothing active — all quiet
      return;
    }

    let workerRestarted = false;

    for (const job of activeJobs) {
      const sinceCreated = Math.round(
        (now.getTime() - new Date(job.created_at).getTime()) / 60000
      );
      const sinceStarted = job.started_at
        ? Math.round(
            (now.getTime() - new Date(job.started_at).getTime()) / 60000
          )
        : null;

      const resubmitCount = job.resubmit_count ?? 0;

      // ── Queued too long ──────────────────────────────────────────────────
      if (job.status === "queued" && sinceCreated >= QUEUED_STUCK_MIN) {
        if (resubmitCount >= MAX_RESUBMITS) {
          // Gave up auto-recovering — alert human
          alerts.push(
            `🚨 *Job stuck in queued — needs human intervention*\n` +
            `Token: \`${job.token.substring(0, 8)}\`\n` +
            `Age: ${sinceCreated}m | Resubmit attempts: ${resubmitCount}\n` +
            `The worker may need manual inspection on the VPS.`
          );
          continue;
        }

        // Restart worker (once per watchdog run, not per job)
        if (!workerRestarted) {
          try {
            restartWorker();
            workerRestarted = true;
            actions.push(`🔄 Restarted trigger-dev worker`);
          } catch (e) {
            alerts.push(
              `⚠️ *Failed to restart worker*\n${e instanceof Error ? e.message : String(e)}`
            );
          }
        }

        // Resubmit the job
        try {
          const newToken = await resubmitJob(job.token, supabase);
          await supabase
            .from("build_jobs")
            .update({ resubmit_count: resubmitCount + 1 })
            .eq("id", job.id);
          actions.push(
            `📤 Resubmitted queued job \`${job.token.substring(0, 8)}\` → \`${newToken.substring(0, 8)}\` (attempt ${resubmitCount + 1})`
          );
        } catch (e) {
          alerts.push(
            `⚠️ *Failed to resubmit job \`${job.token.substring(0, 8)}\`*\n` +
            `${e instanceof Error ? e.message : String(e)}`
          );
        }
      }

      // ── Building too long ────────────────────────────────────────────────
      if (job.status === "building" && sinceStarted !== null) {
        if (sinceStarted >= BUILDING_FAILED_MIN) {
          if (resubmitCount >= MAX_RESUBMITS) {
            alerts.push(
              `🚨 *Job building for ${sinceStarted}m — needs human intervention*\n` +
              `Token: \`${job.token.substring(0, 8)}\`\n` +
              `Resubmit attempts: ${resubmitCount}\n` +
              `Claude may be hung. Check VPS processes.`
            );
            continue;
          }

          // Mark as failed and resubmit
          await supabase
            .from("build_jobs")
            .update({
              status: "failed",
              error: `Watchdog: building for ${sinceStarted}m, exceeded ${BUILDING_FAILED_MIN}m limit`,
              completed_at: now.toISOString(),
            })
            .eq("id", job.id);

          try {
            const newToken = await resubmitJob(job.token, supabase);
            await supabase
              .from("build_jobs")
              .update({ resubmit_count: resubmitCount + 1 })
              .eq("id", job.id);
            actions.push(
              `🔁 Marked \`${job.token.substring(0, 8)}\` as failed (${sinceStarted}m building) → resubmitted as \`${newToken.substring(0, 8)}\``
            );
          } catch (e) {
            alerts.push(
              `⚠️ *Failed to resubmit hung build \`${job.token.substring(0, 8)}\`*\n` +
              `${e instanceof Error ? e.message : String(e)}`
            );
          }
        } else if (sinceStarted >= BUILDING_WARN_MIN) {
          // Just warn — don't cancel yet, Claude might be finishing
          alerts.push(
            `⏳ *Build running long — monitoring*\n` +
            `Token: \`${job.token.substring(0, 8)}\`\n` +
            `Building for ${sinceStarted}m. Will auto-fail at ${BUILDING_FAILED_MIN}m.`
          );
        }
      }
    }

    // ── 2. Send Telegram summary ──────────────────────────────────────────────
    if (actions.length > 0 || alerts.length > 0) {
      const lines: string[] = ["🤖 *Build Watchdog Report*\n"];

      if (actions.length > 0) {
        lines.push("*Actions taken:*");
        lines.push(...actions);
      }

      if (alerts.length > 0) {
        lines.push("");
        lines.push("*Alerts requiring attention:*");
        lines.push(...alerts);
      }

      await sendTelegramMessage(lines.join("\n")).catch(() => {});
    }
  },
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Schedule a PM2 restart 10 seconds from now via a detached background process.
 * We can't call `pm2 restart trigger-dev` synchronously from within trigger-dev
 * itself — it would kill the running task. Instead we fork a shell that waits
 * briefly then restarts, by which point this task will have finished.
 */
function restartWorker(): void {
  const child = spawn(
    "bash",
    ["-c", "sleep 10 && pm2 restart trigger-dev"],
    { detached: true, stdio: "ignore" }
  );
  child.unref();
}

async function resubmitJob(
  originalToken: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<string> {
  // Look up the original form_session to get the payload
  const { data: session } = await supabase
    .from("form_sessions")
    .select("form_type, form_data")
    .eq("token", originalToken)
    .single();

  if (!session) {
    throw new Error(`No form_session found for token ${originalToken.substring(0, 8)}`);
  }

  const response = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": WEBHOOK_API_KEY,
    },
    body: JSON.stringify({
      form_type: session.form_type,
      form_data: session.form_data,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Webhook returned ${response.status}: ${text}`);
  }

  const data = await response.json() as { token?: string };
  if (!data.token) throw new Error("Webhook response missing token");
  return data.token;
}

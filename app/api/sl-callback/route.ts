import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { verifyCallback, estimateBuildCost } from "@/lib/sitelaunchr";
import { sendTelegramMessage } from "@/lib/telegram";
import { Resend } from "resend";
import { getDnsInstructions } from "@/lib/dns-instructions";
import { escapeHtml } from "@/lib/sanitize";
import { isNotificationEnabled, audienceForSubmission } from "@/lib/notification-settings";
import { sendReviewNotificationEmail } from "@/lib/task-emails";

type SlPhase =
  | "queued"
  | "running"
  | "succeeded"
  | "live"
  | "failed"
  | "kura_push_failed"
  | "canceled";

// Lifecycle ordering used to reject out-of-order callbacks.
// SL sometimes delivers `succeeded` after `live` (or retries land in the
// wrong order); applying them blindly walks the row backward from a
// terminal state. Terminal phases (live/failed/canceled/kura_push_failed)
// share the highest rank so nothing can override them.
const PHASE_ORDER: Record<SlPhase, number> = {
  queued: 0,
  running: 1,
  succeeded: 2,
  live: 3,
  failed: 3,
  canceled: 3,
  kura_push_failed: 3,
};

interface SlCallbackBody {
  build_id: string;
  external_id: string;
  status: SlPhase;
  phase: SlPhase;
  site_url: string | null;
  wp_admin_url: string | null;
  kura_project_id: string | null;
  kura_portal_url: string | null;
  github_run_url: string | null;
  cloudways_app_id: string | null;
  error_message: string | null;
  transitioned_at: string;
}

/**
 * Maps an SL phase to our build_jobs.status field.
 */
function phaseToStatus(phase: SlPhase): string {
  switch (phase) {
    case "queued":
      return "queued";
    case "running":
      return "building";
    case "succeeded":
      return "deployed"; // intermediate — Kura push still pending
    case "live":
      return "live"; // terminal success
    case "failed":
    case "kura_push_failed":
    case "canceled":
      return "failed";
    default:
      return "failed";
  }
}

export async function POST(req: NextRequest) {
  const hmacSecret = (process.env.SITELAUNCHR_HMAC_SECRET || "").trim();
  if (!hmacSecret) {
    console.error("[sl-callback] SITELAUNCHR_HMAC_SECRET not configured");
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }

  const timestamp = req.headers.get("x-timestamp");
  const signature = req.headers.get("x-signature");
  if (!timestamp || !signature) {
    return NextResponse.json({ error: "missing_headers" }, { status: 401 });
  }

  // Read the EXACT raw body bytes — re-serializing would invalidate the signature
  const rawBody = await req.text();

  const verification = verifyCallback(timestamp, rawBody, signature, hmacSecret);
  if (!verification.ok) {
    console.warn("[sl-callback] Verification failed:", verification.reason);
    return NextResponse.json({ error: verification.reason }, { status: 401 });
  }

  let body: SlCallbackBody;
  try {
    body = JSON.parse(rawBody) as SlCallbackBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { build_id, external_id, status: phase, site_url, wp_admin_url, kura_project_id, kura_portal_url, github_run_url, cloudways_app_id, error_message, transitioned_at } = body;

  if (!build_id || !phase) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const supabase = createServerClient();

  // Look up the build_jobs row — primarily by sl_build_id, fall back to external_id (= token)
  let { data: job, error: lookupErr } = await supabase
    .from("build_jobs")
    .select("*")
    .eq("sl_build_id", build_id)
    .maybeSingle();

  if (!job && external_id) {
    const fallback = await supabase
      .from("build_jobs")
      .select("*")
      .eq("external_id", external_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    job = fallback.data;
    lookupErr = fallback.error;
  }

  if (lookupErr) {
    console.error("[sl-callback] Lookup error:", lookupErr.message);
  }
  if (!job) {
    console.warn("[sl-callback] No build_jobs row found for build_id:", build_id, "external_id:", external_id);
    // Return 2xx so SL doesn't retry — we can't recover a missing job row.
    return NextResponse.json({ ok: true, note: "no matching build_jobs row" });
  }

  // Idempotency: if we've already recorded this phase, return 200 without re-firing side effects
  if (job.sl_phase === phase) {
    return NextResponse.json({ ok: true, idempotent: true });
  }

  // Reject out-of-order callbacks that would walk the row backward
  // (e.g. a `succeeded` arriving after we've already recorded `live`).
  const currentRank =
    job.sl_phase && job.sl_phase in PHASE_ORDER
      ? PHASE_ORDER[job.sl_phase as SlPhase]
      : -1;
  const incomingRank = PHASE_ORDER[phase];
  if (incomingRank < currentRank) {
    console.log(
      `[sl-callback] Ignoring regressive callback for ${job.id}: ${job.sl_phase} → ${phase}`,
    );
    return NextResponse.json({ ok: true, ignored: "phase_regression" });
  }

  const newStatus = phaseToStatus(phase);
  const transitionedAtIso = transitioned_at || new Date().toISOString();

  // Build the update patch
  const patch: Record<string, unknown> = {
    status: newStatus,
    sl_phase: phase,
    sl_phase_at: transitionedAtIso,
  };
  if (site_url) patch.site_url = site_url;
  if (wp_admin_url) patch.wp_admin_url = wp_admin_url;
  if (kura_project_id) patch.kura_project_id = kura_project_id;
  if (kura_portal_url) patch.kura_portal_url = kura_portal_url;
  if (github_run_url) patch.github_run_url = github_run_url;
  if (cloudways_app_id) patch.cloudways_app_id = cloudways_app_id;
  if (error_message) patch.error = error_message.slice(0, 2000);

  if (phase === "running" && !job.started_at) {
    patch.started_at = transitionedAtIso;
    patch.sl_running_at = transitionedAtIso;
  }

  if (phase === "live") {
    patch.completed_at = transitionedAtIso;
    patch.sl_live_at = transitionedAtIso;

    // Compute build duration & estimated cost
    const startMs = job.sl_running_at
      ? new Date(job.sl_running_at).getTime()
      : new Date(job.created_at).getTime();
    const liveMs = new Date(transitionedAtIso).getTime();
    const durationMin = Math.max(1, (liveMs - startMs) / 60000);
    patch.cost_usd = estimateBuildCost(durationMin);
  }

  if (phase === "failed" || phase === "canceled" || phase === "kura_push_failed") {
    patch.completed_at = transitionedAtIso;
  }

  const { error: updateErr } = await supabase.from("build_jobs").update(patch).eq("id", job.id);
  if (updateErr) {
    console.error("[sl-callback] Update failed:", updateErr.message);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  // ── Side effects on terminal success (live) ──────────────────────
  if (phase === "live" && job.sl_phase !== "live") {
    // Fire DNS instructions email + Telegram + transition task to "review"
    void fireLiveCallbackSideEffects({ job, site_url, wp_admin_url, kura_portal_url });
    void transitionTaskToReview({ job, site_url, wp_admin_url, kura_portal_url });
  }

  // Failure → mark task blocked
  if ((phase === "failed" || phase === "canceled") && job.sl_phase !== phase) {
    void markTaskBlocked(job, error_message || `Build ${phase}`);
  }

  return NextResponse.json({ ok: true });
}

async function fireLiveCallbackSideEffects(args: {
  job: Record<string, unknown>;
  site_url: string | null;
  wp_admin_url: string | null;
  kura_portal_url: string | null;
}) {
  const { job, site_url, wp_admin_url, kura_portal_url } = args;
  const supabase = createServerClient();
  const token = job.token as string;

  // Fetch form_session for business name + DNS provider + client email
  const { data: session } = await supabase
    .from("form_sessions")
    .select("form_data, dns_provider, email")
    .eq("token", token)
    .single();

  const formData = (session?.form_data as Record<string, unknown>) || {};
  const businessName = (formData.business_name as string) || "Your Business";
  const contactEmail =
    (formData.contact_email as string) || (formData.email as string) || (session?.email as string);
  const dnsProvider = (session?.dns_provider as string) || "other";
  const ipAddress = process.env.AGENCY_IP_ADDRESS || "TBD";

  const submissionSource = (formData._source as string) || "claim-your-site";
  const contactAudience = audienceForSubmission(submissionSource);
  const [contactAllowed, adminAllowed] = await Promise.all([
    isNotificationEnabled(contactAudience),
    isNotificationEnabled("admin"),
  ]);

  // DNS-instructions email to the contact (sales agent for sales submissions)
  if (contactEmail && contactAllowed) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const dnsHtml = getDnsInstructions(dnsProvider, ipAddress, businessName);
      await resend.emails.send({
        from: "Website Reveals <creativemarketing@websitereveals.com>",
        to: contactEmail,
        subject: `Site Live: ${escapeHtml(businessName)} — Next Step: Point the Domain`,
        html: `<p>The website for <strong>${escapeHtml(businessName)}</strong> is live and ready for DNS configuration.</p>
               <p><strong>Site URL:</strong> <a href="${site_url}">${site_url}</a><br>
               <strong>WordPress admin:</strong> <a href="${wp_admin_url}">${wp_admin_url}</a></p>
               <hr>${dnsHtml}`,
      });
    } catch (emailErr) {
      console.error("[sl-callback] DNS email failed:", emailErr);
    }
  }

  // Telegram notification with portal URL for review (admin audience)
  if (adminAllowed) {
    try {
      const lines = [
        `✅ SiteLaunchr Build Live — ${businessName}`,
        ``,
        `Site: ${site_url || "(no URL)"}`,
      ];
      if (wp_admin_url) lines.push(`WP admin: ${wp_admin_url}`);
      if (kura_portal_url) lines.push(`Kura portal: ${kura_portal_url}`);
      lines.push(``, `Review and reply to approve.`);
      await sendTelegramMessage(lines.join("\n"));
    } catch (tgErr) {
      console.error("[sl-callback] Telegram failed:", tgErr);
    }
  }

  // Update task: comment with live URL, keep in_progress for manual review
  // (mirror the existing build-website "deployed" behavior)
  const { data: task } = await supabase
    .from("tasks")
    .select("id")
    .eq("client_id", token) // not perfect — tasks are linked by client_id, not token. Fall through if absent.
    .maybeSingle();
  void task;
  // We don't have a direct task_id on build_jobs (legacy). The build-website task
  // path passes taskId in the trigger payload; we don't store it. The Telegram
  // message + email above are enough for review. Manual "Mark Complete" still
  // applies via the existing admin UI on the related task row.
}

async function markTaskBlocked(job: Record<string, unknown>, errorMsg: string) {
  // Future hook for task status update; today, the build_jobs.status='failed'
  // is enough — admin UI surfaces it and Telegram already pings on side-effect path.
  console.log("[sl-callback] build failed for job", job.id, "→", errorMsg);
}

/**
 * On `live`, auto-transition the linked task into "review" so the admin
 * sees it as queued for approval. Fires an admin email so it's visible
 * even without checking the dashboard.
 */
async function transitionTaskToReview(args: {
  job: Record<string, unknown>;
  site_url: string | null;
  wp_admin_url: string | null;
  kura_portal_url: string | null;
}) {
  const taskId = args.job.task_id as string | null | undefined;
  if (!taskId) {
    console.log("[sl-callback] No task_id on build_jobs row; skipping review transition");
    return;
  }
  const supabase = createServerClient();
  const nowIso = new Date().toISOString();

  // Fetch current task for status history + business name
  const { data: task, error: taskErr } = await supabase
    .from("tasks")
    .select("id, title, status, client_id")
    .eq("id", taskId)
    .maybeSingle();
  if (taskErr || !task) {
    console.warn("[sl-callback] Task not found for transition:", taskId, taskErr?.message);
    return;
  }

  const oldStatus = task.status;
  const { error: updErr } = await supabase
    .from("tasks")
    .update({ status: "review", updated_at: nowIso })
    .eq("id", taskId);
  if (updErr) {
    console.error("[sl-callback] Task → review update failed:", updErr.message);
    return;
  }

  // Log status history + system comment with the build URLs
  await supabase.from("task_status_history").insert({
    task_id: taskId,
    old_status: oldStatus,
    new_status: "review",
    notes: "SiteLaunchr build went live — awaiting admin review.",
    changed_by: "system",
  });
  const commentLines = ["Build went live — ready for review."];
  if (args.site_url) commentLines.push(`Site: ${args.site_url}`);
  if (args.wp_admin_url) commentLines.push(`WP admin: ${args.wp_admin_url}`);
  if (args.kura_portal_url) commentLines.push(`Kura portal: ${args.kura_portal_url}`);
  await supabase.from("task_comments").insert({
    task_id: taskId,
    author_type: "system",
    author_name: "Build System",
    content: commentLines.join("\n"),
    is_request: false,
  });

  // Pull business name for the email
  const { data: session } = await supabase
    .from("form_sessions")
    .select("form_data")
    .eq("token", args.job.token as string)
    .maybeSingle();
  const businessName = ((session?.form_data as Record<string, unknown> | null)?.business_name as string) || "Unknown";

  try {
    await sendReviewNotificationEmail({
      taskTitle: task.title,
      businessName,
      siteUrl: args.site_url,
      wpAdminUrl: args.wp_admin_url,
      kuraPortalUrl: args.kura_portal_url,
      taskId,
    });
  } catch (emailErr) {
    console.error("[sl-callback] Review notification email failed:", emailErr);
  }
}

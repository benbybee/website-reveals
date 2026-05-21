import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { verifyCallback, estimateBuildCost } from "@/lib/sitelaunchr";
import { sendTelegramMessage } from "@/lib/telegram";
import { Resend } from "resend";
import { getDnsInstructions } from "@/lib/dns-instructions";
import { escapeHtml } from "@/lib/sanitize";
import { isNotificationEnabled, audienceForSubmission } from "@/lib/notification-settings";
import { sendReviewNotificationEmail } from "@/lib/task-emails";
import { notifyDispatchr } from "@/lib/dispatchr-webhook";
import { computeCostFromTokens } from "@/lib/anthropic-pricing";

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
  // ─── Optional per-build cost reporting (added 2026-05) ─────────────────
  // SL is the only system that knows which Anthropic API calls belong to
  // which build. When the build completes (phase=live) it should send one
  // of these on the same callback to give WR an accurate cost basis.
  //
  // PREFERRED — SL sends the final USD amount it computed (includes any
  // SL-side margin or fees). WR stores it verbatim.
  cost_usd?: number;
  // ALTERNATIVE — SL sends raw token counts + model name; WR computes
  // cost using current Anthropic pricing in lib/anthropic-pricing.ts.
  // Use this when SL wants WR to track at-cost Anthropic spend without
  // SL's own margin baked in.
  usage?: {
    model?: string;
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
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

    // Cost basis — three sources, in order of preference:
    //   1. SL sends a final cost_usd on the callback → store verbatim.
    //   2. SL sends a usage block (model + token counts) → WR computes
    //      cost via lib/anthropic-pricing.ts using current rates.
    //   3. Neither → fall back to the duration-based estimate
    //      (legacy behavior, hits a ceiling clamp on long builds).
    // Token columns are populated whenever SL provides them, regardless
    // of which cost path was used — keeps audit trail intact.
    if (body.usage) {
      const u = body.usage;
      if (typeof u.input_tokens === "number") patch.input_tokens = u.input_tokens;
      if (typeof u.output_tokens === "number") patch.output_tokens = u.output_tokens;
      if (typeof u.cache_creation_input_tokens === "number") patch.cache_creation_tokens = u.cache_creation_input_tokens;
      if (typeof u.cache_read_input_tokens === "number") patch.cache_read_tokens = u.cache_read_input_tokens;
      if (typeof u.model === "string" && u.model.trim()) patch.model = u.model.trim();
    }

    if (typeof body.cost_usd === "number" && body.cost_usd >= 0) {
      // Source 1: SL-computed cost. Trust it.
      patch.cost_usd = body.cost_usd;
    } else if (body.usage && (body.usage.input_tokens || body.usage.output_tokens)) {
      // Source 2: derive from tokens at current Anthropic pricing.
      patch.cost_usd = computeCostFromTokens(
        {
          input_tokens: body.usage.input_tokens,
          output_tokens: body.usage.output_tokens,
          cache_creation_input_tokens: body.usage.cache_creation_input_tokens,
          cache_read_input_tokens: body.usage.cache_read_input_tokens,
        },
        body.usage.model,
      );
    } else {
      // Source 3: legacy estimate from build duration.
      const startMs = job.sl_running_at
        ? new Date(job.sl_running_at).getTime()
        : new Date(job.created_at).getTime();
      const liveMs = new Date(transitionedAtIso).getTime();
      const durationMin = Math.max(1, (liveMs - startMs) / 60000);
      patch.cost_usd = estimateBuildCost(durationMin, job.form_type as string | undefined);
    }
  }

  if (phase === "failed" || phase === "canceled" || phase === "kura_push_failed") {
    patch.completed_at = transitionedAtIso;
  }

  const { error: updateErr } = await supabase.from("build_jobs").update(patch).eq("id", job.id);
  if (updateErr) {
    console.error("[sl-callback] Update failed:", updateErr.message);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  // ── Side effects ─────────────────────────────────────────────────
  // Awaited (not `void`) so they complete before the serverless function
  // returns. The whole block is wrapped in try/catch so a single side-effect
  // failure can't 5xx back to SL and trigger a retry.

  // Build started → move task backlog → in_progress
  if (phase === "running" && job.sl_phase !== "running") {
    try {
      await transitionTaskTo("in_progress", {
        taskId: job.task_id as string | null,
        trigger: "sl.running",
        note: "SiteLaunchr build started.",
      });
    } catch (err) {
      console.error("[sl-callback] in_progress transition failed:", err);
    }
  }

  // Build live → DNS email + Telegram + move task to review + Dispatchr event
  if (phase === "live" && job.sl_phase !== "live") {
    try {
      await fireLiveCallbackSideEffects({ job, site_url, wp_admin_url, kura_portal_url });
    } catch (err) {
      console.error("[sl-callback] live side effects failed:", err);
    }
    try {
      await transitionTaskToReview({ job, site_url, wp_admin_url, kura_portal_url });
    } catch (err) {
      console.error("[sl-callback] review transition failed:", err);
    }
    const businessNameForEvent = await loadBusinessNameForToken(job.token as string);
    await notifyDispatchr({
      type: "build.live",
      token: job.token as string,
      businessName: businessNameForEvent,
      siteUrl: site_url,
      kuraPortalUrl: kura_portal_url,
    });
  }

  // Failure → flag task blocked + Dispatchr event
  const FAILED_PHASES: SlPhase[] = ["failed", "canceled", "kura_push_failed"];
  if (FAILED_PHASES.includes(phase) && job.sl_phase !== phase) {
    try {
      await transitionTaskTo("blocked", {
        taskId: job.task_id as string | null,
        trigger: `sl.${phase}`,
        note: error_message ? `Build ${phase}: ${error_message.slice(0, 300)}` : `Build ${phase}`,
      });
    } catch (err) {
      console.error("[sl-callback] blocked transition failed:", err);
    }
    const businessNameForEvent = await loadBusinessNameForToken(job.token as string);
    await notifyDispatchr({
      type: "build.failed",
      token: job.token as string,
      businessName: businessNameForEvent,
      errorMessage: error_message || `Build ${phase}`,
    });
  }

  return NextResponse.json({ ok: true });
}

/**
 * Shared helper for Dispatchr events that need a human-readable business
 * name. Reads form_data.business_name from the linked form_session, falling
 * back to "Unknown" if missing.
 */
async function loadBusinessNameForToken(token: string): Promise<string> {
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from("form_sessions")
      .select("form_data")
      .eq("token", token)
      .maybeSingle();
    return ((data?.form_data as Record<string, unknown> | null)?.business_name as string) || "Unknown";
  } catch {
    return "Unknown";
  }
}

/**
 * Generic forward-only task status transition. Refuses to walk a task
 * backward (e.g. won't downgrade complete → in_progress) so an out-of-order
 * callback can't undo admin work. Idempotent — same-status no-ops.
 */
const FORWARD_RANK: Record<string, number> = {
  backlog: 0,
  in_progress: 1,
  review: 2,
  blocked: 2,    // blocked is parallel to review (terminal-ish)
  complete: 3,
};
async function transitionTaskTo(
  targetStatus: "in_progress" | "review" | "blocked",
  opts: { taskId: string | null; trigger: string; note: string },
) {
  if (!opts.taskId) {
    console.log(`[sl-callback] No task_id; skipping ${targetStatus} transition`);
    return;
  }
  const supabase = createServerClient();
  const { data: task, error: taskErr } = await supabase
    .from("tasks")
    .select("id, title, status, client_id")
    .eq("id", opts.taskId)
    .maybeSingle();
  if (taskErr || !task) {
    console.warn(`[sl-callback] Task not found for ${targetStatus}:`, opts.taskId);
    return;
  }
  const currentRank = FORWARD_RANK[task.status as string] ?? 0;
  const targetRank = FORWARD_RANK[targetStatus];
  if (currentRank > targetRank) {
    console.log(`[sl-callback] Task ${opts.taskId.slice(0, 8)} is ${task.status} (rank ${currentRank}); won't downgrade to ${targetStatus} (rank ${targetRank})`);
    return;
  }
  if (task.status === targetStatus) return; // idempotent

  const nowIso = new Date().toISOString();
  const { error: updErr } = await supabase
    .from("tasks")
    .update({ status: targetStatus, updated_at: nowIso })
    .eq("id", opts.taskId);
  if (updErr) {
    console.error(`[sl-callback] Task update to ${targetStatus} failed:`, updErr.message);
    return;
  }
  await supabase.from("task_status_history").insert({
    task_id: opts.taskId,
    old_status: task.status,
    new_status: targetStatus,
    notes: opts.note,
    changed_by: "system",
  });
  await import("@/lib/audit-log").then(({ logAudit }) =>
    logAudit({
      actor_type: "sl",
      actor_id: opts.trigger,
      action: "task.auto_transitioned",
      target_type: "task",
      target_id: opts.taskId!,
      details: { from: task.status, to: targetStatus, trigger: opts.trigger },
    }),
  );
  console.log(`[sl-callback] Task ${opts.taskId.slice(0, 8)} ${task.status} → ${targetStatus} (${opts.trigger})`);
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

  // Skip DNS-instructions email for /sales submissions — contact_email is the
  // rep's address and they don't manage DNS. Reps get the "site ready for
  // client review" email when admin marks the task complete (which contains
  // the deployed URL); DNS pointing happens when the client takes possession.
  const isSalesSubmissionLive = submissionSource === "sales";
  if (contactEmail && contactAllowed && !isSalesSubmissionLive) {
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

/**
 * On `live`, auto-transition the linked task into "review" (via the
 * forward-only transitionTaskTo helper), attach a system comment with the
 * build URLs, and email the admin so they can review without checking the
 * dashboard.
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

  // Forward-only transition (won't downgrade a manually-completed task)
  await transitionTaskTo("review", {
    taskId,
    trigger: "sl.live",
    note: "SiteLaunchr build went live — awaiting admin review.",
  });

  // Fetch task for email + comment context
  const { data: task } = await supabase
    .from("tasks")
    .select("id, title, status, client_id")
    .eq("id", taskId)
    .maybeSingle();
  if (!task) return;

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

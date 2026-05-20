import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin-auth";
import { dispatchBuild, SiteLaunchrError } from "@/lib/sitelaunchr";
import { buildSiteLaunchrPayload } from "@/lib/sitelaunchr-mapper";
import { resolveFormType } from "@/lib/resolve-form-type";
import { logAudit } from "@/lib/audit-log";

/**
 * Admin: resubmit a build to SiteLaunchr for a task whose last build
 * attempt failed (or any task — we don't strictly gate on failure, the
 * UI does that). Reads the linked form_session, builds the SL payload
 * the same way submit/route.ts does, dispatches, inserts a new
 * build_jobs row keyed to the existing task, and resets the task to
 * backlog so the next callback auto-transitions it through the normal
 * lifecycle.
 *
 * The previous (failed) build_jobs row stays in the DB as historical
 * record. The new row supersedes it for the task's current build state.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => null);
  const taskId =
    body && typeof body === "object" && typeof (body as { task_id?: unknown }).task_id === "string"
      ? ((body as { task_id: string }).task_id)
      : null;
  if (!taskId) {
    return NextResponse.json({ error: "task_id is required" }, { status: 400 });
  }

  const supabase = createServerClient();

  // Look up the task → client → form_session
  const { data: task, error: taskErr } = await supabase
    .from("tasks")
    .select("id, title, status, client_id")
    .eq("id", taskId)
    .maybeSingle();
  if (taskErr || !task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const { data: client } = await supabase
    .from("clients")
    .select("id, form_session_token")
    .eq("id", task.client_id)
    .maybeSingle();
  if (!client || !client.form_session_token) {
    return NextResponse.json(
      { error: "Task's client has no linked form_session — can't reconstruct payload" },
      { status: 404 },
    );
  }

  const token = client.form_session_token as string;
  const { data: session } = await supabase
    .from("form_sessions")
    .select("token, form_data")
    .eq("token", token)
    .maybeSingle();
  if (!session) {
    return NextResponse.json({ error: "form_session not found" }, { status: 404 });
  }

  const formData = (session.form_data as Record<string, unknown>) || {};
  const formType = resolveFormType(formData);

  // Generate a unique external_id for this retry. SL's idempotency is keyed
  // on (source_id, external_id) — sending the original token would make SL
  // return the previous attempt's sl_build_id as a duplicate, which then
  // collides with our UNIQUE index on build_jobs.sl_build_id and the insert
  // fails. Counting existing build_jobs rows for this token gives us a stable
  // retry index that survives multiple admin resubmits.
  const { count: priorCount } = await supabase
    .from("build_jobs")
    .select("*", { count: "exact", head: true })
    .eq("token", token);
  const retryIndex = priorCount || 0; // "-retry-N" where N = number of existing rows
  const retryExternalId = `${token}-retry-${retryIndex}`;

  // Build the SL payload — unique external_id so SL treats this as a fresh build
  let payload;
  try {
    payload = buildSiteLaunchrPayload({
      token,
      formType,
      formData,
      callbackUrl: process.env.SITELAUNCHR_CALLBACK_URL,
      externalId: retryExternalId,
    });
  } catch (mapErr) {
    const msg = mapErr instanceof Error ? mapErr.message : String(mapErr);
    return NextResponse.json({ error: `Payload build failed: ${msg}` }, { status: 400 });
  }

  // Dispatch to SL
  let dispatch;
  try {
    dispatch = await dispatchBuild(payload);
  } catch (err) {
    if (err instanceof SiteLaunchrError) {
      return NextResponse.json(
        { error: `SL dispatch failed: ${err.status} ${err.code} — ${err.message}` },
        { status: 502 },
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Dispatch error: ${msg}` }, { status: 500 });
  }

  // Belt-and-suspenders: SL shouldn't return duplicate=true with our unique
  // retry external_id, but if their cache is stale, don't insert a row that'd
  // collide with the existing one.
  if (dispatch.duplicate) {
    return NextResponse.json(
      {
        error: `SL returned duplicate=true for retry external_id ${retryExternalId} (build_id ${dispatch.build_id}). Their idempotency cache may be stale.`,
        sl_build_id: dispatch.build_id,
        retry_external_id: retryExternalId,
      },
      { status: 409 },
    );
  }

  const nowIso = new Date().toISOString();

  // Insert the new build_jobs row, linked to the same task
  const { error: insertErr } = await supabase.from("build_jobs").insert({
    token,
    form_type: formType,
    pipeline: "sitelaunchr",
    status: "queued",
    external_id: retryExternalId,
    sl_build_id: dispatch.build_id,
    sl_phase: dispatch.status,
    sl_phase_at: nowIso,
    task_id: taskId,
  });
  if (insertErr) {
    // The dispatch succeeded but we couldn't record it — flag loudly so
    // admin knows the build is running on SL even though our DB is out of sync.
    console.error("[admin:build/resubmit] build_jobs insert failed:", insertErr.message);
    return NextResponse.json(
      {
        error: "SL accepted the build but our DB insert failed. Build is running on SL side.",
        sl_build_id: dispatch.build_id,
      },
      { status: 500 },
    );
  }

  // Reset task to backlog so the running/live callbacks drive it forward again.
  // Only does this if currently in a terminal-ish state (blocked, complete) —
  // don't reset if the task is mid-flight on another build.
  const RESETTABLE = new Set(["blocked", "complete", "review"]);
  if (RESETTABLE.has(task.status as string)) {
    await supabase
      .from("tasks")
      .update({ status: "backlog", updated_at: nowIso })
      .eq("id", taskId);
    await supabase.from("task_status_history").insert({
      task_id: taskId,
      old_status: task.status,
      new_status: "backlog",
      notes: `Resubmitted by admin (${auth.user?.email || "unknown"}). New sl_build_id ${dispatch.build_id}.`,
      changed_by: "admin",
    });
  }

  void logAudit({
    actor_type: "admin",
    actor_id: auth.user?.email || null,
    action: "build.resubmitted",
    target_type: "task",
    target_id: taskId,
    details: {
      token,
      retry_external_id: retryExternalId,
      retry_index: retryIndex,
      sl_build_id: dispatch.build_id,
      from_status: task.status,
      reset_to_backlog: RESETTABLE.has(task.status as string),
    },
  });

  return NextResponse.json({
    ok: true,
    sl_build_id: dispatch.build_id,
    status: dispatch.status,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { notifyDispatchr } from "@/lib/dispatchr-webhook";

const STALE_AFTER_HOURS = 24;
const TOO_OLD_AFTER_DAYS = 7;
const BATCH_LIMIT = 200; // Process at most this many per run; cron repeats hourly

/**
 * Vercel Cron: detect /sales (or any) form_sessions that were started but
 * never submitted, and notify Dispatchr exactly once per session.
 *
 * In scope: form_sessions where
 *   submitted_at IS NULL
 *   AND created_at > now() - 7 days        (don't chase ancient sessions)
 *   AND created_at < now() - 24 hours      (give submitters a full day)
 *   AND dispatchr_notified_abandoned_at IS NULL  (idempotency)
 *
 * Each row's dispatchr_notified_abandoned_at is stamped before the
 * Dispatchr POST so a retry of the same row never double-fires.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();
  const nowMs = Date.now();
  const youngestEligible = new Date(nowMs - STALE_AFTER_HOURS * 3_600_000).toISOString();
  const oldestEligible = new Date(nowMs - TOO_OLD_AFTER_DAYS * 86_400_000).toISOString();

  const { data: abandoned, error } = await supabase
    .from("form_sessions")
    .select("token, form_data, email, current_step, created_at")
    .is("submitted_at", null)
    .is("dispatchr_notified_abandoned_at", null)
    .lt("created_at", youngestEligible)
    .gt("created_at", oldestEligible)
    .order("created_at", { ascending: true })
    .limit(BATCH_LIMIT);

  if (error) {
    console.error("[cron:notify-abandoned] Query failed:", error.message);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }
  if (!abandoned || abandoned.length === 0) {
    return NextResponse.json({ notified: 0 });
  }

  let notified = 0;
  for (const row of abandoned) {
    const fd = (row.form_data as Record<string, unknown> | null) || {};

    // Stamp BEFORE firing so a retry / concurrent run never double-notifies
    const nowIso = new Date().toISOString();
    const { error: stampErr } = await supabase
      .from("form_sessions")
      .update({ dispatchr_notified_abandoned_at: nowIso })
      .eq("token", row.token)
      .is("dispatchr_notified_abandoned_at", null);
    if (stampErr) {
      console.error(
        `[cron:notify-abandoned] Stamp failed for ${row.token}: ${stampErr.message}`,
      );
      continue;
    }

    const createdAtMs = new Date(row.created_at as string).getTime();
    const ageHours = Math.round((nowMs - createdAtMs) / 3_600_000);

    await notifyDispatchr({
      type: "submission.abandoned",
      token: row.token as string,
      businessName: (fd.business_name as string) || "Unknown",
      contactEmail:
        (fd.contact_email as string) || (fd.email as string) || (row.email as string) || null,
      currentStep: (row.current_step as number) ?? 0,
      ageHours,
    });
    notified++;
  }

  return NextResponse.json({ notified });
}

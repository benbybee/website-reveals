import type { SupabaseClient } from "@supabase/supabase-js";
import { getSalesRepById } from "../../sales-reps";
import { isNotificationEnabled } from "../../notification-settings";
import { buildLiveEmail, buildFailedEmail, sendRepBuildEmail } from "../mail/repBuildEmail";

// Full-fidelity terminal-build escalation, shared by the direct SL callback and
// the reconcile cron (ADR 0006) so a build recovered from a DROPPED callback
// still emails the submitting rep — and logs cost when it's available. Every
// step is best-effort: this never throws into its caller (a callback SL retries
// against, or a cron sweeping many builds).

export interface TerminalBuild {
  /** tpl_prospects.source_id — rep-originated builds are `wr-gbp-*`. */
  sourceId: string;
  stage: "live" | "build_failed";
  businessName: string | null;
  salesRepId: string | null;
  campaignId: string | null;
  previewUrl: string | null;
  errorMessage: string | null;
  /** SL build id — the cost-event idempotency key (run_id). */
  buildId: string | null;
  /** Real SL cost when available (direct callback); null on the reconcile path. */
  costUsd: number | null;
}

/** Email the submitting rep (rep-originated builds only) + record cost if given. */
export async function escalateTerminalBuild(db: SupabaseClient, b: TerminalBuild): Promise<void> {
  // 1. Rep email — only for rep-originated builds (source_id wr-gbp-*).
  if (b.sourceId.startsWith("wr-gbp-") && b.salesRepId) {
    try {
      if (await isNotificationEnabled("sales_rep")) {
        const rep = await getSalesRepById(b.salesRepId);
        if (rep?.email) {
          const repName =
            `${rep.first_name}${rep.last_name ? " " + rep.last_name : ""}`.trim() || undefined;
          const businessName = b.businessName ?? "your prospect";
          let content = null;
          if (b.stage === "live" && b.previewUrl) {
            content = buildLiveEmail({ businessName, previewUrl: b.previewUrl, repName });
          } else if (b.stage === "build_failed") {
            content = buildFailedEmail({ businessName, error: b.errorMessage ?? undefined, repName });
          }
          if (content) await sendRepBuildEmail(rep.email, content);
        }
      }
    } catch (e) {
      console.error("[tpl:escalate] rep email failed:", e);
    }
  }

  // 2. Cost — record the real per-build cost when present (G-C4). Idempotent on
  //    run_id (= sl build_id). The reconcile path passes costUsd=null (SL's read
  //    endpoint doesn't return cost), so this is skipped there.
  if (b.costUsd !== null && b.campaignId && b.buildId) {
    try {
      const { data: dup } = await db
        .from("tpl_cost_events")
        .select("id")
        .eq("actor", "sitelaunchr")
        .eq("stage", "build")
        .eq("run_id", b.buildId)
        .maybeSingle();
      if (!dup) {
        await db.from("tpl_cost_events").insert({
          campaign_id: b.campaignId,
          stage: "build",
          actor: "sitelaunchr",
          units: 1,
          usd: b.costUsd,
          rep_id: b.salesRepId ?? null,
          run_id: b.buildId,
        });
      }
    } catch (e) {
      console.error("[tpl:escalate] build cost record failed:", e);
    }
  }
}

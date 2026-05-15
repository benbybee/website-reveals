import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin-auth";

const SL_RUNNING_STUCK_MIN = 60;   // 60 min in queued/running for SL
const GENERAL_STUCK_MIN = 90;      // 90 min overall in 'building'

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const supabase = createServerClient();
  const nowMs = Date.now();
  const slCutoff = new Date(nowMs - SL_RUNNING_STUCK_MIN * 60_000).toISOString();
  const generalCutoff = new Date(nowMs - GENERAL_STUCK_MIN * 60_000).toISOString();

  // SL-pipeline builds in queued or running for too long
  const { data: slStuck } = await supabase
    .from("build_jobs")
    .select(
      "id, token, pipeline, status, sl_phase, sl_build_id, sl_running_at, created_at, started_at, form_sessions:form_sessions!token(form_data)",
    )
    .eq("pipeline", "sitelaunchr")
    .in("sl_phase", ["queued", "running"])
    .lt("created_at", slCutoff);

  // Any pipeline still 'building' for >90 min
  const { data: generalStuck } = await supabase
    .from("build_jobs")
    .select(
      "id, token, pipeline, status, sl_phase, sl_build_id, sl_running_at, created_at, started_at, form_sessions:form_sessions!token(form_data)",
    )
    .eq("status", "building")
    .lt("created_at", generalCutoff);

  const seen = new Set<string>();
  const combined: Array<Record<string, unknown>> = [];

  function pushOnce(rows: Array<Record<string, unknown>> | null | undefined) {
    for (const r of rows || []) {
      if (seen.has(r.id as string)) continue;
      seen.add(r.id as string);
      const formData = ((r.form_sessions as { form_data?: Record<string, unknown> } | null)?.form_data) || {};
      const startedAt = (r.started_at as string | null) || (r.sl_running_at as string | null) || (r.created_at as string);
      combined.push({
        id: r.id,
        token: r.token,
        pipeline: r.pipeline,
        status: r.status,
        sl_phase: r.sl_phase || null,
        sl_build_id: r.sl_build_id || null,
        created_at: r.created_at,
        started_at: r.started_at,
        minutes_stuck: Math.floor((nowMs - new Date(startedAt).getTime()) / 60_000),
        business_name: (formData.business_name as string) || "—",
      });
    }
  }

  pushOnce(slStuck);
  pushOnce(generalStuck);

  combined.sort((a, b) => (b.minutes_stuck as number) - (a.minutes_stuck as number));
  return NextResponse.json({ builds: combined });
}

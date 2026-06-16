import { NextRequest, NextResponse } from "next/server";
import { tplDb } from "@/lib/templates/db";
import { templatesEnabled } from "@/lib/templates/config";
import { readBuild, reconcileAction } from "@/lib/templates/sl/readBuild";

export const dynamic = "force-dynamic";

// ≥ SL's 18-min build target + margin: only act once a callback is genuinely overdue.
const STUCK_AFTER_MIN = 25;
const MAX_PER_RUN = 25;

/**
 * Vercel Cron: reconcile wr-template builds whose terminal callback was dropped.
 *
 * Why (ADR 0006 / gap G-C4-2): SL callbacks are best-effort and a dropped
 * `succeeded` callback strands a prospect at stage=building forever, invisible
 * to /join. SL's `succeeded` phase is a blind spot in its own retry/gap
 * detection, so push can't recover it. This is the PULL backstop: for prospects
 * stuck in `building` past the target, read the authoritative status from SL
 * (GET /api/builds/:build_id) and apply exactly what the callback would have.
 *
 * Idempotent: a row already moved to live/build_failed no longer matches the scan.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!templatesEnabled()) {
    return NextResponse.json({ disabled: true });
  }

  const db = tplDb();
  const cutoff = new Date(Date.now() - STUCK_AFTER_MIN * 60_000).toISOString();

  const { data: stuck, error } = await db
    .from("tpl_prospects")
    .select("id, source_id, sl_build_id, record")
    .eq("stage", "building")
    .not("sl_build_id", "is", null)
    .lt("updated_at", cutoff)
    .limit(MAX_PER_RUN);

  if (error) {
    console.error("[cron:reconcile-template] query failed:", error.message);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }
  if (!stuck || stuck.length === 0) {
    return NextResponse.json({ scanned: 0, recovered: 0, failed: 0, waiting: 0, errors: 0 });
  }

  let recovered = 0;
  let failed = 0;
  let waiting = 0;
  let errors = 0;

  for (const p of stuck) {
    const buildId = p.sl_build_id as string;
    const read = await readBuild(buildId);
    if (!read.ok || !read.build) {
      errors += 1;
      continue; // SL endpoint down / 404 / not yet deployed — try again next run
    }

    const action = reconcileAction(read.build);
    const record = (p.record as Record<string, unknown>) || {};

    if (action.kind === "live") {
      record.preview_url = action.preview_url;
      const { error: upErr } = await db
        .from("tpl_prospects")
        .update({ stage: "live", preview_url: action.preview_url, record, updated_at: new Date().toISOString() })
        .eq("id", p.id);
      if (upErr) errors += 1;
      else recovered += 1;
    } else if (action.kind === "build_failed") {
      record.build_error = action.error;
      const { error: upErr } = await db
        .from("tpl_prospects")
        .update({ stage: "build_failed", record, updated_at: new Date().toISOString() })
        .eq("id", p.id);
      if (upErr) errors += 1;
      else failed += 1;
    } else {
      waiting += 1; // still genuinely building on SL's side
    }
  }

  return NextResponse.json({ scanned: stuck.length, recovered, failed, waiting, errors });
}

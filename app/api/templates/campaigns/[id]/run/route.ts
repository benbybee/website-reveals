import { NextRequest, NextResponse } from "next/server";
import { tasks as triggerTasks } from "@trigger.dev/sdk/v3";
import { requireAdmin } from "@/lib/admin-auth";
import { templatesEnabled } from "@/lib/templates/config";
import { tplDb } from "@/lib/templates/db";
import { TPL_TASK_IDS } from "@/lib/templates/trigger/ids";
import { PROSPECT_STAGES, type RerunConfig, type RerunMode } from "@/lib/templates/rerun";

const MODES: RerunMode[] = ["discover_new", "enrich_existing", "rescrape"];

/**
 * Kick off a (re-)run for a campaign. With no body it behaves like a first run:
 * discover everything, then enrich. A RerunConfig selects one of three modes —
 * find new only, enrich existing, or re-scrape — translated into discover/enrich
 * task payloads. Re-run is the primary way a campaign's list keeps developing.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!templatesEnabled()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;
  const db = tplDb();
  const { data: campaign } = await db
    .from("tpl_campaigns")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!campaign) {
    return NextResponse.json({ error: "campaign not found" }, { status: 404 });
  }

  let config: RerunConfig | null = null;
  try {
    const text = await req.text();
    if (text.trim()) config = JSON.parse(text) as RerunConfig;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (config?.mode && !MODES.includes(config.mode)) {
    return NextResponse.json({ error: "invalid_mode" }, { status: 400 });
  }

  // Optional deeper-crawl bump: raise the per-search target before discovering.
  if (config && typeof config.targetCount === "number" && config.targetCount > 0) {
    await db
      .from("tpl_campaigns")
      .update({ target_count: Math.floor(config.targetCount), updated_at: new Date().toISOString() })
      .eq("id", id);
  }

  const now = new Date().toISOString();

  if (config?.mode === "enrich_existing") {
    const stages = (config.stages ?? []).filter((s) => (PROSPECT_STAGES as readonly string[]).includes(s));
    const effectiveStages = stages.length ? stages : ["scraped", "incomplete"];
    // "enriching" rides along with "scraped": a prospect only persists there
    // when a run died mid-flight, and it is semantically still un-enriched.
    if (effectiveStages.includes("scraped") && !effectiveStages.includes("enriching")) {
      effectiveStages.push("enriching");
    }
    await db.from("tpl_campaigns").update({ status: "enriching", updated_at: now }).eq("id", id);
    const handle = await triggerTasks.trigger(TPL_TASK_IDS.enrich, {
      campaignId: id,
      stages: effectiveStages,
      includeNoSite: config.includeNoSite !== false,
      preserveStage: true,
    });
    return NextResponse.json({ ok: true, runId: handle.id, mode: "enrich_existing" });
  }

  // discover_new, rescrape, or first run all start with discover.
  await db.from("tpl_campaigns").update({ status: "discovering", updated_at: now }).eq("id", id);
  const handle = await triggerTasks.trigger(TPL_TASK_IDS.discover, {
    campaignId: id,
    excludeExisting: config?.mode === "discover_new",
    reEnrich: config?.mode === "rescrape" ? config.reEnrich === true : false,
  });
  return NextResponse.json({ ok: true, runId: handle.id, mode: config?.mode ?? "discover" });
}

import { task, logger } from "@trigger.dev/sdk/v3";
import { tplDb } from "@/lib/templates/db";
import { runActor, recordCostFromRun } from "@/lib/templates/apify/client";
import { scoreStaleness, type TechStackResult, type LighthouseResult } from "@/lib/templates/audit/staleness";
import { TPL_TASK_IDS } from "@/lib/templates/trigger/ids";
import type { CanonicalRecord } from "@/lib/templates/types";

const TECHSTACK_ACTOR = "accurate_pouch/tech-stack-detector";
const LIGHTHOUSE_ACTOR = "nexgendata/google-lighthouse-checker";

interface ProspectRow {
  id: string;
  source_id: string;
  website: string | null;
  record: CanonicalRecord;
}

/**
 * tpl-deep-audit (on-request): run tech-stack + Lighthouse against the
 * has-a-site subset, score staleness, and promote replacement-worthy sites into
 * the qualified pool. Triggered only by an explicit admin action.
 */
export const tplDeepAuditTask = task({
  id: TPL_TASK_IDS.deepAudit,
  maxDuration: 1800,
  queue: { concurrencyLimit: 2 },
  run: async (payload: { campaignId: string; prospectIds: string[] }) => {
    const db = tplDb();

    const { data: prospects } = await db
      .from("tpl_prospects")
      .select("id, source_id, website, record")
      .eq("campaign_id", payload.campaignId)
      .in("id", payload.prospectIds);
    const rows = ((prospects ?? []) as ProspectRow[]).filter((r) => !!r.website);

    let audited = 0;
    let stale = 0;

    for (const row of rows) {
      const url = row.website as string;
      try {
        const [techstack, lighthouse] = await Promise.all([
          runActor(TECHSTACK_ACTOR, { urls: [url] }),
          runActor(LIGHTHOUSE_ACTOR, { urls: [url], device: "desktop" }),
        ]);

        const result = scoreStaleness({
          techstack: techstack.items[0] as TechStackResult,
          lighthouse: lighthouse.items[0] as LighthouseResult,
        });

        const record: CanonicalRecord = { ...row.record, website_status: result.stale ? "stale" : "has_site" };
        const update: Record<string, unknown> = {
          record: { ...record, audit: result },
          website_status: record.website_status,
          updated_at: new Date().toISOString(),
        };
        if (result.stale) {
          update.stage = "qualified";
          stale += 1;
        }
        await db.from("tpl_prospects").update(update).eq("id", row.id);
        audited += 1;
      } catch (e) {
        logger.error("deep-audit: prospect failed", { source_id: row.source_id, error: String(e) });
      }
    }

    if (audited > 0) {
      await recordCostFromRun(db, { campaignId: payload.campaignId, stage: "audit", actor: TECHSTACK_ACTOR, units: audited });
      await recordCostFromRun(db, { campaignId: payload.campaignId, stage: "audit", actor: LIGHTHOUSE_ACTOR, units: audited });
    }

    return { audited, stale };
  },
});

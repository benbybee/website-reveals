import { task, logger } from "@trigger.dev/sdk/v3";
import { tplDb } from "@/lib/templates/db";
import { runActor, recordCostFromRun } from "@/lib/templates/apify/client";
import { mapPlaceToRecord, type PlaceItem } from "@/lib/templates/apify/places";
import { scoreRecord } from "@/lib/templates/score/gate";
import { TPL_TASK_IDS, BACKFILL_ACTOR } from "@/lib/templates/trigger/ids";
import type { CanonicalRecord } from "@/lib/templates/types";

interface ProspectRow {
  id: string;
  campaign_id: string;
  source_id: string;
  record: CanonicalRecord;
}

/** Fill only the empty fields of `base` from `fresh`; never overwrite real data. */
function fillGaps(base: CanonicalRecord, fresh: Partial<CanonicalRecord>): CanonicalRecord {
  const out: CanonicalRecord = { ...base };
  if (!out.phone && fresh.phone) out.phone = fresh.phone;
  if (!out.email && fresh.email) out.email = fresh.email;
  if (!out.website && fresh.website) {
    out.website = fresh.website;
    out.website_status = fresh.website_status;
  }
  if ((!out.hours || out.hours.length === 0) && fresh.hours?.length) out.hours = fresh.hours;
  if (!out.geo && fresh.geo) out.geo = fresh.geo;
  if ((!out.photos || out.photos.length === 0) && fresh.photos?.length) out.photos = fresh.photos;
  if (!out.description && fresh.description) out.description = fresh.description;
  return out;
}

/**
 * tpl-backfill (on-request): re-scrape a targeted prospect subset to fill the
 * fields the gate flagged missing, re-score, and flip `incomplete` → `qualified`
 * where the record now clears the bar. Cost is attributed per campaign.
 */
export const tplBackfillTask = task({
  id: TPL_TASK_IDS.backfill,
  maxDuration: 1800,
  queue: { concurrencyLimit: 2 },
  run: async (payload: { prospectIds: string[] }) => {
    const db = tplDb();

    const { data: prospects } = await db
      .from("tpl_prospects")
      .select("id, campaign_id, source_id, record")
      .in("id", payload.prospectIds);
    const rows = (prospects ?? []) as ProspectRow[];

    const unitsByCampaign = new Map<string, number>();
    let promoted = 0;

    for (const row of rows) {
      const rec = row.record;
      const name = rec.business_name;
      const city = rec.address?.city;
      const state = rec.address?.state;
      if (!name || !state) {
        logger.warn("backfill: insufficient anchor to re-scrape", { source_id: row.source_id });
        continue;
      }

      try {
        const { items } = await runActor(BACKFILL_ACTOR, {
          searchStringsArray: [name],
          locationQuery: city ? `${city}, ${state}` : state,
          maxCrawledPlacesPerSearch: 1,
          language: "en",
        });
        unitsByCampaign.set(row.campaign_id, (unitsByCampaign.get(row.campaign_id) ?? 0) + items.length);

        const fresh = items[0] ? mapPlaceToRecord(items[0] as PlaceItem) : {};
        const merged = fillGaps(rec, fresh);
        const score = scoreRecord(merged);
        merged.confidence = score.confidence;
        const stage = score.missing.length === 0 ? "qualified" : "incomplete";
        if (stage === "qualified") promoted += 1;

        await db
          .from("tpl_prospects")
          .update({
            record: merged,
            phone: merged.phone || null,
            website: merged.website || null,
            website_status: merged.website_status ?? "none",
            confidence: score.confidence,
            completeness: score,
            stage,
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);
      } catch (e) {
        logger.error("backfill: prospect failed", { source_id: row.source_id, error: String(e) });
      }
    }

    for (const [campaignId, units] of unitsByCampaign) {
      await recordCostFromRun(db, { campaignId, stage: "backfill", actor: BACKFILL_ACTOR, units });
    }

    return { processed: rows.length, promoted };
  },
});

import { task, logger } from "@trigger.dev/sdk/v3";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tplDb } from "@/lib/templates/db";
import { runActor, recordCostFromRun } from "@/lib/templates/apify/client";
import { assembleRecord } from "@/lib/templates/enrich";
import { mapFacebookToRecord, type FacebookItem } from "@/lib/templates/enrich/facebook";
import { verifyAssets } from "@/lib/templates/enrich/verifyAssets";
import { TPL_TASK_IDS } from "@/lib/templates/trigger/ids";
import type { CanonicalRecord } from "@/lib/templates/types";

const FB_ACTOR = "apify/facebook-pages-scraper";

interface ProspectRow {
  id: string;
  source_id: string;
  record: Partial<CanonicalRecord>;
}

/**
 * tpl-enrich: for every `scraped` prospect, verify its assets (drop dead URLs),
 * best-effort Facebook gap-fill, derive services, score, and persist as
 * `qualified` or `incomplete`. Facebook is best-effort: the scraper returns an
 * error shape without auth cookies, which we treat as "no enrichment" rather
 * than a failure. Each prospect is isolated so one bad record can't sink the run.
 */
export const tplEnrichTask = task({
  id: TPL_TASK_IDS.enrich,
  maxDuration: 1800,
  queue: { concurrencyLimit: 2 },
  run: async (payload: { campaignId: string }) => {
    const db = tplDb();

    const { data: campaign } = await db
      .from("tpl_campaigns")
      .select("id, industry_slug")
      .eq("id", payload.campaignId)
      .single();
    if (!campaign) throw new Error(`Campaign not found: ${payload.campaignId}`);
    const industrySlug = (campaign as { industry_slug: string }).industry_slug;

    const { data: industry } = await db
      .from("tpl_industries")
      .select("sl_slug")
      .eq("slug", industrySlug)
      .maybeSingle();
    const slSlug = (industry as { sl_slug: string } | null)?.sl_slug ?? industrySlug;

    const { data: prospects } = await db
      .from("tpl_prospects")
      .select("id, source_id, record")
      .eq("campaign_id", payload.campaignId)
      .eq("stage", "scraped");
    const rows = (prospects ?? []) as ProspectRow[];

    let qualified = 0;
    let incomplete = 0;
    let fbRuns = 0;

    for (const row of rows) {
      try {
        await db.from("tpl_prospects").update({ stage: "enriching" }).eq("id", row.id);

        // Drop dead asset URLs before scoring so the gate sees only real assets.
        const cleanedPlace = await verifyAssets(row.record as CanonicalRecord);

        // Best-effort Facebook enrichment when the discovered record carries a FB URL.
        let facebook: Partial<CanonicalRecord> = {};
        const fbUrl = cleanedPlace.socials?.facebook;
        if (fbUrl) {
          try {
            const { items } = await runActor(FB_ACTOR, { startUrls: [{ url: fbUrl }], resultsLimit: 1 });
            fbRuns += 1;
            facebook = mapFacebookToRecord(items[0] as FacebookItem);
          } catch (e) {
            logger.warn("enrich: facebook skipped", { source_id: row.source_id, error: String(e) });
          }
        }

        const gbpCategories = cleanedPlace.industry_raw ? [cleanedPlace.industry_raw] : [];
        const { record, score } = assembleRecord({
          place: cleanedPlace,
          facebook,
          gbpCategories,
          industrySlug: slSlug,
        });

        const stage = score.missing.length === 0 ? "qualified" : "incomplete";
        if (stage === "qualified") qualified += 1;
        else incomplete += 1;

        await db
          .from("tpl_prospects")
          .update({
            record,
            business_name: record.business_name || null,
            city: record.address?.city || null,
            state: record.address?.state || null,
            phone: record.phone || null,
            website: record.website || null,
            website_status: record.website_status ?? "none",
            confidence: score.confidence,
            completeness: score,
            stage,
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);

        await persistAssets(db, row.id, record);
      } catch (e) {
        logger.error("enrich: prospect failed", { source_id: row.source_id, error: String(e) });
      }
    }

    if (fbRuns > 0) {
      await recordCostFromRun(db, {
        campaignId: payload.campaignId,
        stage: "enrich",
        actor: FB_ACTOR,
        units: fbRuns,
      });
    }

    await db
      .from("tpl_campaigns")
      .update({
        qualified_count: qualified,
        incomplete_count: incomplete,
        status: "ready",
        updated_at: new Date().toISOString(),
      })
      .eq("id", payload.campaignId);

    return { qualified, incomplete };
  },
});

/** Replace a prospect's asset rows with the verified logo + photos on the record. */
async function persistAssets(db: SupabaseClient, prospectId: string, record: CanonicalRecord) {
  await db.from("tpl_prospect_assets").delete().eq("prospect_id", prospectId);

  const rows: Record<string, unknown>[] = [];
  if (record.logo?.src_url) {
    rows.push({
      prospect_id: prospectId,
      kind: "logo",
      slot: null,
      src_url: record.logo.src_url,
      width: record.logo.width ?? null,
      height: record.logo.height ?? null,
      fetch_verified: true,
    });
  }
  for (const photo of record.photos ?? []) {
    rows.push({
      prospect_id: prospectId,
      kind: "photo",
      slot: photo.slot,
      src_url: photo.src_url,
      alt: photo.alt ?? null,
      fetch_verified: true,
    });
  }
  if (rows.length) await db.from("tpl_prospect_assets").insert(rows);
}

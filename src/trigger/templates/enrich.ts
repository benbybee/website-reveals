import { task, logger, wait } from "@trigger.dev/sdk/v3";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tplDb } from "@/lib/templates/db";
import { runActor, recordCostFromRun } from "@/lib/templates/apify/client";
import { assembleRecord } from "@/lib/templates/enrich";
import {
  ENRICH_BATCH_SIZE,
  BATCH_DISPATCH_LIMIT,
  ORPHAN_STALE_MS,
  chunk,
  aggregateBatchOutputs,
  resolveStage,
  shouldProcessProspect,
  type EnrichBatchOutput,
} from "@/lib/templates/enrich/batch";
import { mapFacebookToRecord, type FacebookItem } from "@/lib/templates/enrich/facebook";
import { verifyAssets } from "@/lib/templates/enrich/verifyAssets";
import { TPL_TASK_IDS } from "@/lib/templates/trigger/ids";
import { scrapeBrandDNA } from "@/lib/firecrawl";
import { firecrawlEnabled, FIRECRAWL_USD_PER_CREDIT, FIRECRAWL_CREDITS_PER_SCRAPE } from "@/lib/templates/config";
import type { BrandColors, CanonicalRecord, LogoAsset } from "@/lib/templates/types";
import type { EnrichPayload, EnrichBatchPayload } from "@/lib/templates/rerun";

const FB_ACTOR = "apify/facebook-pages-scraper";

// Default stage selection includes "enriching" so every run sweeps up crash
// orphans — but ONLY stale ones (see ORPHAN_STALE_MS): a fresh "enriching"
// stamp belongs to a live child of another run and is never re-selected.
const DEFAULT_STAGES = ["scraped", "enriching"];

// Supabase caps a select at 1000 rows — keyset-page the ID fetch so campaigns
// beyond 1000 prospects enrich completely instead of silently truncating.
const ID_PAGE_SIZE = 1000;

// batchTriggerAndWait can throw (rate limit, transient API failure), possibly
// after dispatching part of the slice. Idempotency keys make the retry safe:
// already-dispatched children are deduped, missing ones are filled in.
const DISPATCH_ATTEMPTS = 3;
const DISPATCH_RETRY_WAIT_S = 30;

interface ProspectRow {
  id: string;
  source_id: string;
  stage: string;
  website: string | null;
  record: Partial<CanonicalRecord>;
  updated_at: string | null;
}

/**
 * tpl-enrich (parent): resolve the campaign once, select the prospect IDs to
 * process, fan them out to tpl-enrich-batch children (ENRICH_BATCH_SIZE per
 * child), then roll up campaign counts. The parent is checkpointed while the
 * children run — batchTriggerAndWait time does not count toward maxDuration —
 * so campaign size can grow without ever hitting the parent's duration limit.
 * (The old single-run sequential loop timed out at ~165 prospects.)
 */
export const tplEnrichTask = task({
  id: TPL_TASK_IDS.enrich,
  maxDuration: 1800,
  queue: { concurrencyLimit: 2 },
  // Any uncaught parent failure (campaign missing, select error, dispatch dead
  // after retries) must not strand the campaign in "enriching" — that was the
  // user-visible symptom of the original incident. "error" keeps it re-runnable.
  onFailure: async ({ payload }: { payload: EnrichPayload }) => {
    const db = tplDb();
    await db
      .from("tpl_campaigns")
      .update({ status: "error", updated_at: new Date().toISOString() })
      .eq("id", payload.campaignId);
  },
  run: async (payload: EnrichPayload, { ctx }) => {
    const db = tplDb();
    const stages = payload.stages && payload.stages.length > 0 ? payload.stages : DEFAULT_STAGES;
    const includeNoSite = payload.includeNoSite !== false;
    const preserveStage = payload.preserveStage === true;

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

    // Keyset-page the full ID set (offset paging skips boundary rows when a
    // concurrent writer changes stage membership between pages). "enriching"
    // rows are selected only when their stamp is stale — fresh ones are being
    // processed by a live run right now.
    const orphanCutoff = new Date(Date.now() - ORPHAN_STALE_MS).toISOString();
    const ids: string[] = [];
    for (let lastId = ""; ; ) {
      let query = db
        .from("tpl_prospects")
        .select("id")
        .eq("campaign_id", payload.campaignId)
        .in("stage", stages)
        .or(`stage.neq.enriching,updated_at.lt.${orphanCutoff}`)
        .order("id", { ascending: true })
        .limit(ID_PAGE_SIZE);
      if (lastId) query = query.gt("id", lastId);
      if (!includeNoSite) query = query.not("website", "is", null);
      const { data: page, error } = await query;
      if (error) throw new Error(`Prospect select failed: ${error.message}`);
      const pageIds = ((page ?? []) as { id: string }[]).map((r) => r.id);
      ids.push(...pageIds);
      if (pageIds.length < ID_PAGE_SIZE) break;
      lastId = pageIds[pageIds.length - 1];
    }

    logger.info("enrich: dispatching batches", {
      campaignId: payload.campaignId,
      prospects: ids.length,
      batchSize: ENRICH_BATCH_SIZE,
      stages,
    });

    const outputs: Array<EnrichBatchOutput | null> = [];
    const batches = chunk(ids, ENRICH_BATCH_SIZE);
    let dispatched = 0;
    for (const slice of chunk(batches, BATCH_DISPATCH_LIMIT)) {
      const items = slice.map((prospectIds, i) => ({
        payload: {
          campaignId: payload.campaignId,
          prospectIds,
          industrySlug: slSlug,
          stages,
          preserveStage,
        } satisfies EnrichBatchPayload,
        options: { idempotencyKey: `${ctx.run.id}:batch:${dispatched + i}` },
      }));
      dispatched += slice.length;

      let runs: Awaited<ReturnType<typeof tplEnrichBatchTask.batchTriggerAndWait>>["runs"] | null = null;
      for (let attempt = 1; attempt <= DISPATCH_ATTEMPTS; attempt += 1) {
        try {
          ({ runs } = await tplEnrichBatchTask.batchTriggerAndWait(items));
          break;
        } catch (e) {
          logger.error("enrich: batch dispatch failed", { attempt, error: String(e) });
          if (attempt < DISPATCH_ATTEMPTS) await wait.for({ seconds: DISPATCH_RETRY_WAIT_S });
        }
      }

      if (!runs) {
        // Slice is dead after retries: count its children as failed batches and
        // keep going — the self-heal sweep picks its prospects up next run.
        outputs.push(...slice.map(() => null));
        continue;
      }
      for (const run of runs) {
        if (run.ok) {
          outputs.push(run.output as EnrichBatchOutput);
        } else {
          outputs.push(null);
          logger.error("enrich: batch run failed", { runId: run.id, error: String(run.error) });
        }
      }
    }
    const agg = aggregateBatchOutputs(outputs);

    // Roll up campaign counts from the whole prospect set, not just this run's
    // subset — a partial re-enrich must not clobber the campaign-wide totals.
    const countStage = async (stage: string) => {
      const { count } = await db
        .from("tpl_prospects")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", payload.campaignId)
        .eq("stage", stage);
      return count ?? 0;
    };
    const [qualifiedTotal, incompleteTotal] = await Promise.all([
      countStage("qualified"),
      countStage("incomplete"),
    ]);

    // Per-prospect failures are normal best-effort attrition (bad data, dead
    // sites) — the next run sweeps them. Whole batches failing is systemic, so
    // surface it as "error" instead of silently declaring the campaign ready.
    const status = agg.failedBatches > 0 ? "error" : "ready";
    if (agg.failedBatches > 0) {
      logger.error("enrich: completed with failed batches", {
        failedBatches: agg.failedBatches,
        prospectsAffected: agg.failedBatches * ENRICH_BATCH_SIZE,
      });
    }

    await db
      .from("tpl_campaigns")
      .update({
        qualified_count: qualifiedTotal,
        incomplete_count: incompleteTotal,
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", payload.campaignId);

    return {
      qualified: agg.qualified,
      incomplete: agg.incomplete,
      failed: agg.failed,
      skipped: agg.skipped,
      failedBatches: agg.failedBatches,
      qualifiedTotal,
      incompleteTotal,
      status,
    };
  },
});

/**
 * tpl-enrich-batch (child): enrich a small slice of prospects — verify assets
 * (drop dead URLs), best-effort Facebook gap-fill, best-effort brand DNA from
 * the business website, derive services, score, persist. Facebook and DNA are
 * additive: failures never disqualify a prospect. Each prospect is isolated so
 * one bad record can't sink the batch; each batch is isolated so one dead
 * batch can't sink the campaign. Cost events are recorded per child so spend
 * is attributed even when other batches fail.
 */
export const tplEnrichBatchTask = task({
  id: TPL_TASK_IDS.enrichBatch,
  // Worst case per prospect: 300s Apify actor ceiling + 60s Firecrawl timeout
  // + 3x10s asset HEAD checks ~= 390s, so ENRICH_BATCH_SIZE(5) x 390s ~= 1950s
  // leaves ~45% headroom even when a provider degradation hits every prospect.
  maxDuration: 3600,
  queue: { concurrencyLimit: 5 },
  run: async (payload: EnrichBatchPayload): Promise<EnrichBatchOutput> => {
    const db = tplDb();
    const preserveStage = payload.preserveStage === true;
    const dnaEnabled = firecrawlEnabled();

    let qualified = 0;
    let incomplete = 0;
    let failed = 0;
    let skipped = 0;
    let fbRuns = 0;
    let firecrawlCredits = 0;

    for (const prospectId of payload.prospectIds) {
      // Re-read the row immediately before processing: the parent's select may
      // be minutes old by now, and the stage/record can have moved (rep action,
      // SL callback, another run). Working from a fresh row shrinks the stale-
      // write window from minutes to the seconds this one prospect takes.
      const { data: rowData, error: rowErr } = await db
        .from("tpl_prospects")
        .select("id, source_id, stage, website, record, updated_at")
        .eq("campaign_id", payload.campaignId)
        .eq("id", prospectId)
        .maybeSingle();
      if (rowErr) {
        failed += 1;
        logger.error("enrich: prospect select failed", { prospectId, error: rowErr.message });
        continue;
      }
      const row = rowData as ProspectRow | null;
      if (!row) {
        skipped += 1;
        continue;
      }

      if (
        !shouldProcessProspect({
          stage: row.stage,
          updatedAt: row.updated_at,
          stages: payload.stages,
          nowMs: Date.now(),
        })
      ) {
        skipped += 1;
        continue;
      }

      try {
        // Claim the row: the "enriching" flip + fresh stamp tells concurrent
        // runs this prospect is in-flight (their guard skips fresh stamps).
        // Skipped when preserving stage so a re-enrich never disturbs a rep's
        // pipeline position.
        if (!preserveStage) {
          await db
            .from("tpl_prospects")
            .update({ stage: "enriching", updated_at: new Date().toISOString() })
            .eq("id", row.id);
        }

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

        // Brand DNA: scrape the business website (when present) for a logo and a
        // single primary color so the SL preview looks like the prospect's brand.
        // Best-effort and additive — failures never disqualify a prospect, and
        // no-website businesses simply skip this (they're still prime targets).
        let dnaLogo: LogoAsset | undefined;
        let dnaColors: BrandColors | undefined;
        if (dnaEnabled && cleanedPlace.website) {
          try {
            const dna = await scrapeBrandDNA(cleanedPlace.website);
            firecrawlCredits += dna.creditsUsed ?? FIRECRAWL_CREDITS_PER_SCRAPE;
            if (dna.logoUrl) dnaLogo = { src_url: dna.logoUrl };
            if (dna.primaryColor) {
              const c = dna.colors ?? {};
              dnaColors = {
                primary: dna.primaryColor,
                accent: c.accent || c.secondary || undefined,
                neutral_dark: c.textPrimary || undefined,
                neutral_light: c.background || undefined,
              };
            }
          } catch (e) {
            logger.warn("enrich: brand DNA skipped", { source_id: row.source_id, error: String(e) });
          }
        }

        const gbpCategories = cleanedPlace.industry_raw ? [cleanedPlace.industry_raw] : [];
        const { record, score } = assembleRecord({
          place: cleanedPlace,
          facebook,
          gbpCategories,
          logo: dnaLogo,
          brandColors: dnaColors,
          industrySlug: payload.industrySlug,
        });

        const stage = resolveStage({
          preserveStage,
          currentStage: row.stage,
          missingCount: score.missing.length,
        });
        if (score.missing.length === 0) qualified += 1;
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
        failed += 1;
        logger.error("enrich: prospect failed", { source_id: row.source_id, error: String(e) });
      }
    }

    // Cost rows are bookkeeping — losing one must never fail a batch whose
    // prospect writes already landed (the parent would count the whole batch
    // failed and the numbers would lie about work that succeeded).
    if (fbRuns > 0) {
      try {
        await recordCostFromRun(db, {
          campaignId: payload.campaignId,
          stage: "enrich",
          actor: FB_ACTOR,
          units: fbRuns,
        });
      } catch (e) {
        logger.error("enrich: FB cost event failed", { error: String(e) });
      }
    }

    if (firecrawlCredits > 0) {
      const { error } = await db.from("tpl_cost_events").insert({
        campaign_id: payload.campaignId,
        stage: "enrich",
        actor: "firecrawl",
        units: firecrawlCredits,
        usd: firecrawlCredits * FIRECRAWL_USD_PER_CREDIT(),
        run_id: null,
      });
      if (error) logger.error("enrich: firecrawl cost event failed", { error: error.message });
    }

    return { qualified, incomplete, failed, skipped };
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

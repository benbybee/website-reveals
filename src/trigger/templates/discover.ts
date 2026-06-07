import { task, tasks, logger } from "@trigger.dev/sdk/v3";
import { tplDb } from "@/lib/templates/db";
import { runActor, recordCostFromRun } from "@/lib/templates/apify/client";
import { mapPlaceToRecord, type PlaceItem } from "@/lib/templates/apify/places";
import { toStateName } from "@/lib/templates/normalize/state";
import { TPL_TASK_IDS } from "@/lib/templates/trigger/ids";
import type { DiscoverPayload } from "@/lib/templates/rerun";

const PLACES_ACTOR = "compass/crawler-google-places";

interface CampaignRow {
  id: string;
  industry_slug: string;
  locations: { state?: string; city?: string; radius?: number }[];
  target_count: number;
}

interface IndustryRow {
  slug: string;
  google_categories: string[];
  sl_slug: string;
}

/**
 * tpl-discover: scrape businesses for a campaign via Google Places, map each to
 * a partial canonical record, and persist as `scraped` prospects (deduped on
 * source_id). One actor run per location (all categories batched), then chains
 * into enrich.
 *
 * Re-run aware: NEW businesses are always inserted as `scraped`. EXISTING
 * prospects are never knocked back a stage — `excludeExisting` skips them
 * entirely (append-only "find new" mode), otherwise their discovered fields are
 * refreshed while their stage is preserved, unless `reEnrich` is set (which
 * resets them to `scraped` so enrich reprocesses the refreshed data).
 */
export const tplDiscoverTask = task({
  id: TPL_TASK_IDS.discover,
  maxDuration: 900,
  queue: { concurrencyLimit: 2 },
  run: async (payload: DiscoverPayload) => {
    const db = tplDb();
    const excludeExisting = payload.excludeExisting === true;
    const reEnrich = payload.reEnrich === true;

    const { data: campaign, error: campErr } = await db
      .from("tpl_campaigns")
      .select("id, industry_slug, locations, target_count")
      .eq("id", payload.campaignId)
      .single();
    if (campErr || !campaign) throw new Error(`Campaign not found: ${payload.campaignId}`);
    const camp = campaign as CampaignRow;

    const { data: industry } = await db
      .from("tpl_industries")
      .select("slug, google_categories, sl_slug")
      .eq("slug", camp.industry_slug)
      .maybeSingle();
    const ind = industry as IndustryRow | null;

    const categories =
      ind?.google_categories && ind.google_categories.length > 0
        ? ind.google_categories
        : [camp.industry_slug];
    const slSlug = ind?.sl_slug ?? camp.industry_slug;
    const perSearch = Math.max(1, camp.target_count || 25);

    // Map of source_id -> current stage for prospects already in this campaign.
    // Drives the re-run branching below (skip / refresh-preserving / reset).
    const existing = new Map<string, string>();
    {
      const { data: rows } = await db
        .from("tpl_prospects")
        .select("source_id, stage")
        .eq("campaign_id", camp.id);
      for (const r of (rows ?? []) as { source_id: string; stage: string }[]) {
        existing.set(r.source_id, r.stage);
      }
    }

    let scraped = 0;
    let added = 0;
    let refreshed = 0;
    let skipped = 0;
    for (const loc of camp.locations ?? []) {
      const state = (loc.state ?? "").trim();
      if (!state) continue;
      // Expand the state to its full US name and scope to "USA" so Google Places
      // can't resolve a bare 2-letter code to a country (e.g. "CA" -> Canada
      // instead of California). Fall back to the raw input for unknown values.
      const region = toStateName(state) ?? state;
      const locationQuery = loc.city ? `${loc.city}, ${region}, USA` : `${region}, USA`;

      logger.info("discover: running places", { locationQuery, categories });
      const { items, runId } = await runActor(PLACES_ACTOR, {
        searchStringsArray: categories,
        locationQuery,
        maxCrawledPlacesPerSearch: perSearch,
        language: "en",
        skipClosedPlaces: false,
      });

      for (const raw of items as PlaceItem[]) {
        const record = mapPlaceToRecord(raw);
        if (!record.source_id) continue;
        const stamped = { ...record, industry_slug: slSlug };
        const isExisting = existing.has(record.source_id);

        // "Find new" mode: leave everything we already have untouched.
        if (isExisting && excludeExisting) {
          skipped += 1;
          continue;
        }

        const fields = {
          place_id: raw.placeId ?? null,
          record: stamped,
          business_name: record.business_name ?? null,
          city: record.address?.city ?? null,
          state: record.address?.state ?? null,
          phone: record.phone ?? null,
          website: record.website ?? null,
          website_status: record.website_status ?? "none",
          updated_at: new Date().toISOString(),
        };

        if (isExisting) {
          // Refresh discovered fields. Preserve the prospect's stage (so a rep's
          // progress isn't reset) unless the re-run explicitly asked to re-enrich.
          const patch = reEnrich ? { ...fields, stage: "scraped" } : fields;
          const { error } = await db.from("tpl_prospects").update(patch).eq("campaign_id", camp.id).eq("source_id", record.source_id);
          if (error) {
            logger.error("discover: refresh failed", { source_id: record.source_id, error: error.message });
            continue;
          }
          refreshed += 1;
        } else {
          const { error } = await db.from("tpl_prospects").insert({
            campaign_id: camp.id,
            source_id: record.source_id,
            stage: "scraped",
            ...fields,
          });
          if (error) {
            logger.error("discover: insert failed", { source_id: record.source_id, error: error.message });
            continue;
          }
          existing.set(record.source_id, "scraped");
          added += 1;
        }
        scraped += 1;
      }

      await recordCostFromRun(db, {
        campaignId: camp.id,
        stage: "discover",
        actor: PLACES_ACTOR,
        units: items.length,
        runId,
      });
    }

    const { count } = await db
      .from("tpl_prospects")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", camp.id);

    await db
      .from("tpl_campaigns")
      .update({ scraped_count: count ?? scraped, status: "enriching", updated_at: new Date().toISOString() })
      .eq("id", camp.id);

    logger.info("discover: done", { added, refreshed, skipped, total: count ?? scraped });
    await tasks.trigger(TPL_TASK_IDS.enrich, { campaignId: camp.id });

    return { scraped: count ?? scraped, added, refreshed, skipped };
  },
});

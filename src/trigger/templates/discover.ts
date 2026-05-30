import { task, tasks, logger } from "@trigger.dev/sdk/v3";
import { tplDb } from "@/lib/templates/db";
import { runActor, recordCostFromRun } from "@/lib/templates/apify/client";
import { mapPlaceToRecord, type PlaceItem } from "@/lib/templates/apify/places";
import { TPL_TASK_IDS } from "@/lib/templates/trigger/ids";

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
 * a partial canonical record, and upsert as `scraped` prospects (deduped on
 * source_id). One actor run per location (all categories batched), then chains
 * into enrich. Re-running a campaign overwrites prospects rather than duplicating.
 */
export const tplDiscoverTask = task({
  id: TPL_TASK_IDS.discover,
  maxDuration: 900,
  queue: { concurrencyLimit: 2 },
  run: async (payload: { campaignId: string }) => {
    const db = tplDb();

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

    let scraped = 0;
    for (const loc of camp.locations ?? []) {
      const state = (loc.state ?? "").trim();
      if (!state) continue;
      const locationQuery = loc.city ? `${loc.city}, ${state}` : state;

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
        const { error } = await db.from("tpl_prospects").upsert(
          {
            campaign_id: camp.id,
            source_id: record.source_id,
            place_id: raw.placeId ?? null,
            record: stamped,
            business_name: record.business_name ?? null,
            city: record.address?.city ?? null,
            state: record.address?.state ?? null,
            phone: record.phone ?? null,
            website: record.website ?? null,
            website_status: record.website_status ?? "none",
            stage: "scraped",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "source_id" },
        );
        if (error) {
          logger.error("discover: upsert failed", { source_id: record.source_id, error: error.message });
          continue;
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

    await tasks.trigger(TPL_TASK_IDS.enrich, { campaignId: camp.id });

    return { scraped: count ?? scraped };
  },
});

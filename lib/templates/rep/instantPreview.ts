import type { SupabaseClient } from "@supabase/supabase-js";
import { getReadyIndustry } from "../industries/registry";
import { repSpentTodayUsd, withinRepBudget } from "../cost/budget";
import { REP_DAILY_BUDGET_USD, SL_TEMPLATE_TRANSPORT } from "../config";
import { findOrCreateSalesCampaign } from "../salesIntake";
import { placeDetails } from "../places/client";
import { mapPlaceDetails } from "../places/mapPlaceDetails";
import { quickEnrich } from "../enrich/quickEnrich";
import { assembleAndPush } from "../sl/push";

// The rep instant-preview loop's executor (ADR 0007): pick → GBP details →
// deterministic quick-enrich → single push. The cost + coverage guards run
// BEFORE any paid Places call so a not-ready industry or an over-budget rep
// never spends. Extracted from the route so the guards are unit-tested.

export interface InstantPreviewInput {
  db: SupabaseClient;
  rep: { rep_id: string; email: string };
  /** Google place_id chosen by the rep. */
  placeId: string;
  /** tpl_industries slug the rep picked (resolved to its sl_slug here). */
  industrySlug: string;
  /** Injectable homepage fetch (best-effort); omitted in tests / no-site path. */
  fetchHtml?: (url: string) => Promise<string | null>;
}

export type InstantPreviewResult =
  | { ok: true; prospectId: string; batchId: string; recordCount: number }
  | { ok: false; code: "template_not_ready" }
  | { ok: false; code: "over_budget"; cap: number };

function utcDayStartIso(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
}

export async function runInstantPreview(input: InstantPreviewInput): Promise<InstantPreviewResult> {
  const { db, rep, placeId, industrySlug, fetchHtml } = input;

  // Guard 1 (coverage): never build an industry SL has no live template for.
  const industry = await getReadyIndustry(db, industrySlug);
  if (!industry) return { ok: false, code: "template_not_ready" };

  // Guard 2 (budget): stop before any paid Places call if the rep is over cap.
  const spent = await repSpentTodayUsd(db, rep.rep_id, utcDayStartIso());
  if (!withinRepBudget(spent)) {
    return { ok: false, code: "over_budget", cap: REP_DAILY_BUDGET_USD() };
  }

  const campaignId = await findOrCreateSalesCampaign(db, {
    id: rep.rep_id,
    email: rep.email,
    firstName: null,
    lastName: null,
  });

  // Paid Places details (ledgered with rep_id) → normalized record.
  const details = await placeDetails(placeId, { db, campaignId, repId: rep.rep_id });
  const place = mapPlaceDetails(details);

  // Best-effort homepage fetch feeds the deterministic enricher.
  let html: string | undefined;
  if (place.website && fetchHtml) {
    html = (await fetchHtml(place.website).catch(() => null)) ?? undefined;
  }

  const { record, score } = await quickEnrich({
    place,
    industrySlug: industry.sl_slug,
    html,
    db,
    campaignId,
    repId: rep.rep_id,
  });

  const stage = score.missing.length === 0 ? "qualified" : "incomplete";
  const { data: up, error } = await db
    .from("tpl_prospects")
    .upsert(
      {
        campaign_id: campaignId,
        source_id: record.source_id,
        record,
        business_name: record.business_name,
        city: record.address.city || null,
        state: record.address.state || null,
        phone: record.phone || null,
        website: record.website || null,
        website_status: record.website_status ?? "none",
        industry_slug: record.industry_slug || null,
        sales_rep_id: rep.rep_id, // ownership: the lead is this rep's, from the session
        agent_id: rep.email,
        stage,
      },
      { onConflict: "source_id" },
    )
    .select("id")
    .single();
  if (error) throw new Error(`failed upserting rep prospect: ${error.message}`);
  const prospectId = (up as { id: string }).id;

  const transport = SL_TEMPLATE_TRANSPORT() === "table" ? "table" : "post";
  const push = await assembleAndPush(db, campaignId, { prospectIds: [prospectId], transport });

  return { ok: true, prospectId, batchId: push.batchId, recordCount: push.recordCount };
}

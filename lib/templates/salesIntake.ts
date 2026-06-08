// Sales-agent submission → Template flow intake.
//
// A /sales submission no longer dispatches to SiteLaunchr. Instead it lands as a
// HELD prospect (stage 'awaiting_template') inside the submitting rep's permanent
// "sales" campaign. The operator releases it later — once a template exists for
// the prospect's industry — via the same Approve → Push → Convert pipeline that
// discovery prospects use. We map the form_data into the canonical record now so
// the prospect is build-ready the moment its template ships.

import type { SupabaseClient } from "@supabase/supabase-js";
import { tplDb } from "./db";
import type { Address, BrandColors, CanonicalRecord, ServiceItem } from "./types";

export const SALES_CAMPAIGN_KIND = "sales";
export const HELD_STAGE = "awaiting_template";

export interface SalesRepInfo {
  id: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
}

export interface IntakeResult {
  campaignId: string;
  prospectId: string;
}

function str(fd: Record<string, unknown>, key: string): string {
  const v = fd[key];
  return typeof v === "string" ? v.trim() : "";
}

/** Map a /sales form_data blob into the canonical prospect record. */
export function formDataToCanonicalRecord(
  token: string,
  fd: Record<string, unknown>,
): CanonicalRecord {
  const businessName = str(fd, "business_name") || "Unknown Business";
  const website = str(fd, "current_url");

  const services: ServiceItem[] = str(fd, "all_services")
    .split(/[,\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((name) => ({ name }));

  const hexes = str(fd, "brand_colors")
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((h) => /^#[0-9a-f]{6}$/i.test(h));
  let brandColors: BrandColors | undefined;
  if (hexes.length) {
    brandColors = { primary: hexes[0] };
    if (hexes[1]) brandColors.accent = hexes[1];
    if (hexes[2]) brandColors.neutral_dark = hexes[2];
    if (hexes[3]) brandColors.neutral_light = hexes[3];
  }

  // The sales form captures a flat address string (or none, on the no-site path).
  // We store it whole in `street`; the SL build mapper flattens address back to a
  // single line anyway, so no precision is lost.
  const address: Address = {
    street: str(fd, "address"),
    city: "",
    state: "",
    zip: "",
    country: "US",
  };

  const record: CanonicalRecord = {
    source_id: `wr-sales-${token}`,
    business_name: businessName,
    industry_slug: str(fd, "industry_slug"),
    address,
    phone: str(fd, "phone"),
    website_status: website ? "has_site" : "none",
  };

  const industryRaw = str(fd, "industry");
  if (industryRaw) record.industry_raw = industryRaw;
  const email = str(fd, "email");
  if (email) record.email = email;
  if (website) {
    record.website = website;
    record.sources = [website];
  }
  if (services.length) record.services = services;
  const description = str(fd, "about_text") || str(fd, "differentiators");
  if (description) record.description = description;
  const logoUrl = str(fd, "logo_url");
  if (logoUrl) record.logo = { src_url: logoUrl };
  if (brandColors) record.brand_colors = brandColors;
  const imageUrls = Array.isArray(fd.image_urls)
    ? (fd.image_urls as unknown[]).filter((u): u is string => typeof u === "string")
    : [];
  if (imageUrls.length) {
    record.photos = imageUrls.map((src_url, i) => ({
      slot: i === 0 ? "hero" : `gallery-${i}`,
      src_url,
    }));
  }

  return record;
}

function campaignName(rep: SalesRepInfo): string {
  const name = [rep.firstName, rep.lastName].filter(Boolean).join(" ").trim();
  const label = name || rep.email || "Unattributed";
  return `${label} — Sales submissions`;
}

/**
 * Find the rep's existing sales campaign or create it. Keyed on sales_rep_id when
 * the rep is known (unique index enforces one per rep); falls back to matching by
 * name when the submission can't be attributed to a sales_reps row.
 */
async function findOrCreateSalesCampaign(
  db: SupabaseClient,
  rep: SalesRepInfo,
): Promise<string> {
  const name = campaignName(rep);

  if (rep.id) {
    const { data: existing } = await db
      .from("tpl_campaigns")
      .select("id")
      .eq("kind", SALES_CAMPAIGN_KIND)
      .eq("sales_rep_id", rep.id)
      .maybeSingle();
    if (existing) return (existing as { id: string }).id;
  } else {
    const { data: existing } = await db
      .from("tpl_campaigns")
      .select("id")
      .eq("kind", SALES_CAMPAIGN_KIND)
      .eq("name", name)
      .maybeSingle();
    if (existing) return (existing as { id: string }).id;
  }

  const { data, error } = await db
    .from("tpl_campaigns")
    .insert({
      kind: SALES_CAMPAIGN_KIND,
      sales_rep_id: rep.id,
      name,
      industry_slug: null,
      state: null,
      locations: [],
      status: "intake",
      created_by: rep.email,
    })
    .select("id")
    .single();

  if (error) {
    // 23505 = a concurrent submission created the rep's campaign first. Re-read it.
    if (error.code === "23505" && rep.id) {
      const { data: raced } = await db
        .from("tpl_campaigns")
        .select("id")
        .eq("kind", SALES_CAMPAIGN_KIND)
        .eq("sales_rep_id", rep.id)
        .maybeSingle();
      if (raced) return (raced as { id: string }).id;
    }
    throw new Error(`failed creating sales campaign: ${error.message}`);
  }
  return (data as { id: string }).id;
}

/**
 * Land a /sales submission as a held prospect in the rep's sales campaign.
 * Idempotent on source_id (= wr-sales-{token}); a re-submit of the same token
 * overwrites rather than duplicates.
 */
export async function intakeSalesProspect(args: {
  token: string;
  formData: Record<string, unknown>;
  rep: SalesRepInfo;
}): Promise<IntakeResult> {
  const db = tplDb();
  const campaignId = await findOrCreateSalesCampaign(db, args.rep);
  const record = formDataToCanonicalRecord(args.token, args.formData);

  const { data, error } = await db
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
        agent_id: args.rep.email,
        stage: HELD_STAGE,
      },
      { onConflict: "source_id" },
    )
    .select("id")
    .single();

  if (error) throw new Error(`failed creating sales prospect: ${error.message}`);
  return { campaignId, prospectId: (data as { id: string }).id };
}

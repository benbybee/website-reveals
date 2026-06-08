import { createSSRClient } from "@/lib/supabase/server-ssr";
import { redirect, notFound } from "next/navigation";
import { templatesEnabled } from "@/lib/templates/config";
import { tplDb } from "@/lib/templates/db";
import { rollupCost, type CostRow } from "@/lib/templates/cost/rollup";
import { CampaignsPanel, type CampaignSummary } from "@/components/admin/templates/CampaignsPanel";
import { SalesCampaignsPanel, type SalesCampaignSummary } from "@/components/admin/templates/SalesCampaignsPanel";
import type { TplIndustry } from "@/lib/templates/industries";

export const dynamic = "force-dynamic";
export const metadata = { title: "Template Sites — Website Reveals" };

export default async function TemplatesPage() {
  if (!templatesEnabled()) notFound();

  const ssr = await createSSRClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) redirect("/admin/login");

  const db = tplDb();
  // Discovery campaigns drive the main panel (one per industry+state, auto-scraped).
  // Sales campaigns (one per rep, holding submitted prospects) are listed separately
  // below — they never get scraped and have no industry/state of their own.
  const [{ data: campaigns }, { data: salesCampaigns }, { data: costEvents }, { data: industries }] = await Promise.all([
    db.from("tpl_campaigns").select("*").eq("kind", "discovery").order("created_at", { ascending: false }),
    db.from("tpl_campaigns").select("id, name, created_at").eq("kind", "sales").order("created_at", { ascending: false }),
    db.from("tpl_cost_events").select("campaign_id, stage, usd"),
    db.from("tpl_industries").select("*").order("display_name", { ascending: true }),
  ]);

  // Per-sales-campaign prospect tallies (total + how many are awaiting a template).
  const salesIds = ((salesCampaigns ?? []) as { id: string }[]).map((c) => c.id);
  const salesCounts = new Map<string, { total: number; awaiting: number }>();
  if (salesIds.length) {
    const { data: salesProspects } = await db
      .from("tpl_prospects")
      .select("campaign_id, stage")
      .in("campaign_id", salesIds);
    for (const p of (salesProspects ?? []) as { campaign_id: string; stage: string }[]) {
      const t = salesCounts.get(p.campaign_id) ?? { total: 0, awaiting: 0 };
      t.total += 1;
      if (p.stage === "awaiting_template") t.awaiting += 1;
      salesCounts.set(p.campaign_id, t);
    }
  }

  const salesSummaries: SalesCampaignSummary[] = ((salesCampaigns ?? []) as Record<string, unknown>[]).map((c) => {
    const id = c.id as string;
    const counts = salesCounts.get(id) ?? { total: 0, awaiting: 0 };
    return {
      id,
      name: (c.name as string) ?? "Unnamed rep",
      created_at: c.created_at as string,
      prospect_count: counts.total,
      awaiting_count: counts.awaiting,
    };
  });

  const costByCampaign = new Map<string, CostRow[]>();
  for (const e of (costEvents ?? []) as { campaign_id: string; stage: string; usd: number | null }[]) {
    const arr = costByCampaign.get(e.campaign_id) ?? [];
    arr.push({ stage: e.stage, usd: e.usd });
    costByCampaign.set(e.campaign_id, arr);
  }

  const summaries: CampaignSummary[] = ((campaigns ?? []) as Record<string, unknown>[]).map((c) => {
    const id = c.id as string;
    const rollup = rollupCost(costByCampaign.get(id) ?? [], (c.qualified_count as number) ?? 0);
    return {
      id,
      industry_slug: c.industry_slug as string,
      state: (c.state as string) ?? null,
      locations: (c.locations as { state?: string; city?: string }[]) ?? [],
      status: c.status as string,
      target_count: (c.target_count as number) ?? 0,
      scraped_count: (c.scraped_count as number) ?? 0,
      qualified_count: (c.qualified_count as number) ?? 0,
      incomplete_count: (c.incomplete_count as number) ?? 0,
      pushed_count: (c.pushed_count as number) ?? 0,
      audit_enabled: (c.audit_enabled as boolean) ?? false,
      cost_total: rollup.total,
      cost_per_qualified: rollup.costPerQualified,
      created_at: c.created_at as string,
    };
  });

  return (
    <div style={{ minHeight: "100vh", background: "#faf9f5", padding: "32px 24px 80px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <CampaignsPanel campaigns={summaries} industries={(industries ?? []) as TplIndustry[]} />
        <SalesCampaignsPanel campaigns={salesSummaries} />
      </div>
    </div>
  );
}

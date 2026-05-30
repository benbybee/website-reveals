import { createSSRClient } from "@/lib/supabase/server-ssr";
import { redirect, notFound } from "next/navigation";
import { templatesEnabled } from "@/lib/templates/config";
import { tplDb } from "@/lib/templates/db";
import { rollupCost, type CostRow } from "@/lib/templates/cost/rollup";
import { CampaignsPanel, type CampaignSummary } from "@/components/admin/templates/CampaignsPanel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Template Sites — Website Reveals" };

export default async function TemplatesPage() {
  if (!templatesEnabled()) notFound();

  const ssr = await createSSRClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) redirect("/admin/login");

  const db = tplDb();
  const [{ data: campaigns }, { data: costEvents }] = await Promise.all([
    db.from("tpl_campaigns").select("*").order("created_at", { ascending: false }),
    db.from("tpl_cost_events").select("campaign_id, stage, usd"),
  ]);

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
        <CampaignsPanel campaigns={summaries} />
      </div>
    </div>
  );
}

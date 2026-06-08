import { createSSRClient } from "@/lib/supabase/server-ssr";
import { redirect, notFound } from "next/navigation";
import { templatesEnabled } from "@/lib/templates/config";
import { tplDb } from "@/lib/templates/db";
import { campaignCost } from "@/lib/templates/cost/rollup";
import { ProspectsTable, type CampaignHeader } from "@/components/admin/templates/ProspectsTable";
import { CampaignMailPanel } from "@/components/admin/templates/CampaignMailPanel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Campaign — Template Sites" };

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  if (!templatesEnabled()) notFound();
  const { id } = await params;

  const ssr = await createSSRClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) redirect("/admin/login");

  const db = tplDb();
  const { data: campaign } = await db.from("tpl_campaigns").select("*").eq("id", id).maybeSingle();
  if (!campaign) notFound();

  const cost = await campaignCost(db, id);
  const c = campaign as Record<string, unknown>;
  const header: CampaignHeader = {
    id,
    industry_slug: c.industry_slug as string,
    name: (c.name as string) ?? null,
    status: c.status as string,
    scraped_count: (c.scraped_count as number) ?? 0,
    qualified_count: (c.qualified_count as number) ?? 0,
    incomplete_count: (c.incomplete_count as number) ?? 0,
    pushed_count: (c.pushed_count as number) ?? 0,
    cost_total: cost.total,
    cost_per_qualified: cost.costPerQualified,
  };

  return (
    <div style={{ minHeight: "100vh", background: "#faf9f5", padding: "32px 24px 80px" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <ProspectsTable campaign={header} />
        <CampaignMailPanel
          campaignId={id}
          initialDesignId={(c.postcard_design_id as string) ?? null}
          initialAddressId={(c.return_address_id as string) ?? null}
          initialProvider={(c.mail_provider as string) ?? "lob"}
        />
      </div>
    </div>
  );
}

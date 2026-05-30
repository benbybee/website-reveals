import { createSSRClient } from "@/lib/supabase/server-ssr";
import { redirect, notFound } from "next/navigation";
import { templatesEnabled } from "@/lib/templates/config";
import { tplDb } from "@/lib/templates/db";
import { SalesBoard, type SalesProspect } from "@/components/admin/templates/SalesBoard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sales — Template Sites" };

const SALES_STAGES = ["qualified", "approved", "building", "live", "build_failed"];

export default async function SalesPage() {
  if (!templatesEnabled()) notFound();

  const ssr = await createSSRClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) redirect("/admin/login");

  const db = tplDb();
  const { data } = await db
    .from("tpl_prospects")
    .select("id, business_name, city, state, phone, website, stage, agent_id, record")
    .in("stage", SALES_STAGES)
    .order("updated_at", { ascending: false })
    .limit(500);

  const prospects: SalesProspect[] = ((data ?? []) as Record<string, unknown>[]).map((p) => ({
    id: p.id as string,
    business_name: (p.business_name as string) ?? null,
    city: (p.city as string) ?? null,
    state: (p.state as string) ?? null,
    phone: (p.phone as string) ?? null,
    website: (p.website as string) ?? null,
    stage: p.stage as string,
    agent_id: (p.agent_id as string) ?? null,
    preview_url: ((p.record as { preview_url?: string } | null)?.preview_url) ?? null,
  }));

  return (
    <div style={{ minHeight: "100vh", background: "#faf9f5", padding: "32px 24px 80px" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <SalesBoard prospects={prospects} userEmail={user.email ?? ""} stages={SALES_STAGES} />
      </div>
    </div>
  );
}

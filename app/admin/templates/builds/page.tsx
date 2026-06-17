import { createSSRClient } from "@/lib/supabase/server-ssr";
import { redirect, notFound } from "next/navigation";
import { templatesEnabled } from "@/lib/templates/config";
import { tplDb } from "@/lib/templates/db";
import { BuildsBoard } from "@/components/admin/templates/BuildsBoard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Builds — Template Sites" };

export default async function BuildsPage() {
  if (!templatesEnabled()) notFound();

  const ssr = await createSSRClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) redirect("/admin/login");

  // Campaigns drive the filter dropdown + the campaign→industry label lookup the
  // board renders next to each build. (Campaign label = industry slug.)
  const db = tplDb();
  const { data: campRows } = await db
    .from("tpl_campaigns")
    .select("id, industry_slug, name")
    .order("created_at", { ascending: false });
  const campaigns = ((campRows ?? []) as { id: string; industry_slug: string | null; name: string | null }[]).map((c) => ({
    id: c.id,
    label: c.industry_slug || c.name || c.id.slice(0, 8),
  }));

  return (
    <div style={{ minHeight: "100vh", background: "#faf9f5", padding: "32px 24px 80px" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <BuildsBoard campaigns={campaigns} />
      </div>
    </div>
  );
}

import { createSSRClient } from "@/lib/supabase/server-ssr";
import { redirect, notFound } from "next/navigation";
import { templatesEnabled } from "@/lib/templates/config";
import { tplDb } from "@/lib/templates/db";
import { SuppressionBoard } from "@/components/admin/templates/SuppressionBoard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Suppressed — Template Sites" };

export default async function SuppressedPage() {
  if (!templatesEnabled()) notFound();

  const ssr = await createSSRClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) redirect("/admin/login");

  // Campaigns drive the campaign label lookup; their distinct industry_slugs
  // drive the industry filter dropdown.
  const db = tplDb();
  const { data: campRows } = await db
    .from("tpl_campaigns")
    .select("id, industry_slug, name")
    .order("created_at", { ascending: false });
  const rows = (campRows ?? []) as { id: string; industry_slug: string | null; name: string | null }[];
  const campaigns = rows.map((c) => ({ id: c.id, label: c.industry_slug || c.name || c.id.slice(0, 8) }));
  const industries = Array.from(
    new Set(rows.map((c) => c.industry_slug).filter((s): s is string => !!s)),
  ).sort();

  return (
    <div style={{ minHeight: "100vh", background: "#faf9f5", padding: "32px 24px 80px" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <SuppressionBoard campaigns={campaigns} industries={industries} />
      </div>
    </div>
  );
}

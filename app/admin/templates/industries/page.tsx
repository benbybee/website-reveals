import { createSSRClient } from "@/lib/supabase/server-ssr";
import { redirect, notFound } from "next/navigation";
import { templatesEnabled } from "@/lib/templates/config";
import { tplDb } from "@/lib/templates/db";
import { IndustriesSettings } from "@/components/admin/templates/IndustriesSettings";
import type { TplIndustry } from "@/lib/templates/industries";

export const dynamic = "force-dynamic";
export const metadata = { title: "Industries — Template Sites" };

export default async function IndustriesPage() {
  if (!templatesEnabled()) notFound();

  const ssr = await createSSRClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) redirect("/admin/login");

  const db = tplDb();
  const { data: industries } = await db
    .from("tpl_industries")
    .select("*")
    .order("display_name", { ascending: true });

  return (
    <div style={{ minHeight: "100vh", background: "#faf9f5", padding: "32px 24px 80px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <IndustriesSettings initialIndustries={(industries ?? []) as TplIndustry[]} />
      </div>
    </div>
  );
}

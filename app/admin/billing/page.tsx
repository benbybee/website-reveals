import { createServerClient } from "@/lib/supabase/server";
import { createSSRClient } from "@/lib/supabase/server-ssr";
import { redirect } from "next/navigation";
import { BillingShell } from "@/components/admin/BillingShell";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Billing — Website Reveals",
};

interface RawBuild {
  id: string;
  cost_usd: number | null;
  completed_at: string | null;
  site_url: string | null;
  token: string;
  invoice_id: string | null;
  form_sessions: {
    form_data: Record<string, unknown> | null;
  } | null;
}

export default async function BillingPage() {
  const ssrClient = await createSSRClient();
  const {
    data: { user },
  } = await ssrClient.auth.getUser();
  if (!user) redirect("/admin/login");

  const supabase = createServerClient();

  const [buildsRes, invoicesRes] = await Promise.all([
    supabase
      .from("build_jobs")
      .select(
        "id, cost_usd, completed_at, site_url, token, invoice_id, form_sessions:form_sessions!token(form_data)"
      )
      .not("cost_usd", "is", null)
      .order("completed_at", { ascending: false }),
    supabase
      .from("invoices")
      .select("*")
      .order("created_at", { ascending: false }),
  ]);

  if (buildsRes.error) console.error("[billing] Builds fetch failed:", buildsRes.error);
  if (invoicesRes.error) console.error("[billing] Invoices fetch failed:", invoicesRes.error);

  const rawBuilds = (buildsRes.data || []) as unknown as RawBuild[];

  const builds = rawBuilds.map((b) => {
    const fd = b.form_sessions?.form_data || {};
    return {
      id: b.id,
      cost_usd: b.cost_usd,
      completed_at: b.completed_at,
      site_url: b.site_url,
      invoice_id: b.invoice_id,
      business_name: (fd.business_name as string) || "Unknown",
      source: (fd._source as string) || "claim-your-site",
    };
  });

  return (
    <div style={{ minHeight: "100vh", background: "#faf9f5", padding: "32px 24px 80px" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <BillingShell builds={builds} invoices={invoicesRes.data || []} userEmail={user.email || ""} />
      </div>
    </div>
  );
}

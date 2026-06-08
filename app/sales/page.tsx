import { redirect } from "next/navigation";
import { getSalesRepSession } from "@/lib/sales-rep-auth";
import { getSalesRepById } from "@/lib/sales-reps";
import { tplDb } from "@/lib/templates/db";
import { SalesV2Shell, type IndustryOption } from "@/components/sales-v2/SalesV2Shell";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "New Client Site — Sales Rep",
  robots: { index: false, follow: false },
};

export default async function SalesPage() {
  const session = await getSalesRepSession();
  if (!session) redirect("/sales-rep/login?next=/sales");

  const rep = await getSalesRepById(session.rep_id);
  if (!rep || !rep.active) redirect("/sales-rep/login?next=/sales");

  // The questionnaire's industry dropdown is sourced from the SAME taxonomy the
  // Template flow uses (tpl_industries). A submission's industry_slug must match
  // a template's slug downstream, so we offer only those canonical industries.
  const { data: industries } = await tplDb()
    .from("tpl_industries")
    .select("slug, display_name")
    .order("display_name", { ascending: true });

  return (
    <SalesV2Shell
      rep={{
        first_name: rep.first_name,
        last_name: rep.last_name,
        email: rep.email,
      }}
      industries={(industries ?? []) as IndustryOption[]}
    />
  );
}

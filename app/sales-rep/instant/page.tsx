import { redirect } from "next/navigation";
import { getSalesRepSession } from "@/lib/sales-rep-auth";
import { getSalesRepById } from "@/lib/sales-reps";
import { tplDb } from "@/lib/templates/db";
import { templatesEnabled, googlePlacesEnabled } from "@/lib/templates/config";
import { templateReadyIndustries } from "@/lib/templates/industries/registry";
import { InstantPreview } from "@/components/sales-rep/InstantPreview";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Instant Preview — Sales Rep — Website Reveals",
  robots: { index: false, follow: false },
};

export default async function InstantPreviewPage() {
  const session = await getSalesRepSession();
  if (!session) redirect("/sales-rep/login");

  const rep = await getSalesRepById(session.rep_id);
  if (!rep || !rep.active) redirect("/sales-rep/login");
  if (!templatesEnabled()) redirect("/sales-rep");

  const industries = await templateReadyIndustries(tplDb());

  return (
    <div style={{ minHeight: "100vh", background: "#faf9f5", padding: "32px 24px 80px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <InstantPreview industries={industries} placesEnabled={googlePlacesEnabled()} />
      </div>
    </div>
  );
}

import { redirect } from "next/navigation";
import { getSalesRepSession } from "@/lib/sales-rep-auth";
import { getSalesRepById } from "@/lib/sales-reps";
import { SalesV2Shell } from "@/components/sales-v2/SalesV2Shell";

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

  return (
    <SalesV2Shell
      rep={{
        first_name: rep.first_name,
        last_name: rep.last_name,
        email: rep.email,
      }}
    />
  );
}

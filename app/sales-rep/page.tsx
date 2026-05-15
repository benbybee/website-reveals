import { redirect } from "next/navigation";
import { getSalesRepSession } from "@/lib/sales-rep-auth";
import { getDashboardDataForRep, getSalesRepById } from "@/lib/sales-reps";
import { SalesRepDashboard } from "@/components/sales-rep/SalesRepDashboard";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Dashboard — Sales Rep — Website Reveals",
  robots: { index: false, follow: false },
};

export default async function SalesRepDashboardPage() {
  const session = await getSalesRepSession();
  if (!session) redirect("/sales-rep/login");

  const rep = await getSalesRepById(session.rep_id);
  if (!rep || !rep.active) redirect("/sales-rep/login");

  const data = await getDashboardDataForRep(rep.id);

  return (
    <div style={{ minHeight: "100vh", background: "#faf9f5", padding: "32px 24px 80px" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <SalesRepDashboard
          rep={{ first_name: rep.first_name, last_name: rep.last_name, email: rep.email }}
          sessions={data.sessions as never[]}
          clients={data.clients as never[]}
          tasks={data.tasks as never[]}
        />
      </div>
    </div>
  );
}

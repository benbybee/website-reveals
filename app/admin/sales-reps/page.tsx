import { createSSRClient } from "@/lib/supabase/server-ssr";
import { redirect } from "next/navigation";
import { listSalesReps } from "@/lib/sales-reps";
import { SalesRepsShell } from "@/components/admin/SalesRepsShell";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sales Reps — Website Reveals",
};

export default async function SalesRepsPage() {
  const ssr = await createSSRClient();
  const {
    data: { user },
  } = await ssr.auth.getUser();
  if (!user) redirect("/admin/login");

  const reps = await listSalesReps();

  return (
    <div style={{ minHeight: "100vh", background: "#faf9f5", padding: "32px 24px 80px" }}>
      <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
        <SalesRepsShell reps={reps} userEmail={user.email || ""} />
      </div>
    </div>
  );
}

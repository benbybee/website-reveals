import { createServerClient } from "@/lib/supabase/server";
import { createSSRClient } from "@/lib/supabase/server-ssr";
import { redirect } from "next/navigation";
import { ArchivedShell, type ArchivedRow } from "@/components/admin/ArchivedShell";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Archived Tasks — Website Reveals",
};

const RETENTION_DAYS = 90;

export default async function ArchivedTasksPage() {
  const ssr = await createSSRClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) redirect("/admin/login");

  const supabase = createServerClient();
  // Server component — safe to read the clock at request time. The purity
  // rule doesn't distinguish RSC from client, hence the disable.
  // eslint-disable-next-line react-hooks/purity
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString();

  const { data: rows } = await supabase
    .from("tasks")
    .select(
      `id, title, status, priority, completed_at, archived_at, tags,
       sales_outcome, sales_outcome_at, sales_outcome_notes,
       client:clients(id, first_name, last_name, company_name, email),
       sales_rep:sales_reps!sales_outcome_by(first_name, last_name, email)`,
    )
    .not("archived_at", "is", null)
    .gte("archived_at", cutoff)
    .order("archived_at", { ascending: false })
    .limit(500);

  const tasks = (rows || []) as unknown as ArchivedRow[];

  return (
    <div style={{ minHeight: "100vh", background: "#faf9f5", padding: "32px 24px 80px" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <ArchivedShell tasks={tasks} retentionDays={RETENTION_DAYS} />
      </div>
    </div>
  );
}

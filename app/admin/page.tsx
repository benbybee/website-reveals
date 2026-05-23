import { createServerClient } from "@/lib/supabase/server";
import { createSSRClient } from "@/lib/supabase/server-ssr";
import { AdminShell } from "@/components/admin/AdminShell";
import type { FormSession } from "@/lib/supabase/types";
import type { Client, TaskWithClient } from "@/lib/types/client-tasks";
import { listSalesReps } from "@/lib/sales-reps";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Admin — Website Reveals",
};

export default async function AdminPage() {
  const supabase = createServerClient();
  const ssrClient = await createSSRClient();
  const {
    data: { user },
  } = await ssrClient.auth.getUser();

  const [sessionsRes, clientsRes, tasksRes, salesReps, notNeededRes] = await Promise.all([
    supabase
      .from("form_sessions")
      .select("*")
      .not("submitted_at", "is", null)
      .order("submitted_at", { ascending: false }),
    supabase
      .from("clients")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("tasks")
      .select(
        "*, client:clients(id, first_name, last_name, company_name, email)"
      )
      .is("parent_task_id", null)
      .is("archived_at", null)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false }),
    listSalesReps(),
    // Count of rep-flagged "not needed" tasks awaiting admin cleanup. Drives
    // the red badge on the Archived nav link — gives the admin a one-glance
    // signal that there's something to review in /admin/archived.
    supabase
      .from("tasks")
      .select("*", { count: "exact", head: true })
      .eq("sales_outcome", "not_needed"),
  ]);

  if (sessionsRes.error)
    console.error("Failed to fetch submissions:", sessionsRes.error);
  if (clientsRes.error)
    console.error("Failed to fetch clients:", clientsRes.error);
  if (tasksRes.error)
    console.error("Failed to fetch tasks:", tasksRes.error);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#faf9f5",
        padding: "32px 24px 80px",
      }}
    >
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <AdminShell
          sessions={(sessionsRes.data as FormSession[]) || []}
          clients={(clientsRes.data as Client[]) || []}
          tasks={(tasksRes.data as TaskWithClient[]) || []}
          salesReps={salesReps.map((r) => ({ id: r.id, first_name: r.first_name, last_name: r.last_name, email: r.email, active: r.active }))}
          userEmail={user?.email || ""}
          notNeededCount={notNeededRes.count ?? 0}
        />
      </div>
    </div>
  );
}

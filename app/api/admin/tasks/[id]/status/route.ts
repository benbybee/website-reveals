import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { updateTaskStatus, logTaskCompletion, getTaskById } from "@/lib/tasks";
import { getClientById } from "@/lib/clients";
import { sendStatusChangeEmail, sendSalesRepCompletionEmail } from "@/lib/task-emails";
import { tasks as triggerTasks } from "@trigger.dev/sdk/v3";
import type { TaskStatus } from "@/lib/types/client-tasks";
import { isNotificationEnabled, audienceForClientId } from "@/lib/notification-settings";
import { logAudit } from "@/lib/audit-log";
import { createServerClient } from "@/lib/supabase/server";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;

  try {
    const { status, notes } = await req.json();

    if (!status) {
      return NextResponse.json(
        { error: "status is required" },
        { status: 400 }
      );
    }

    const prior = await getTaskById(id);
    const task = await updateTaskStatus(
      id,
      status as TaskStatus,
      notes,
      "admin"
    );

    void logAudit({
      actor_type: "admin",
      actor_id: auth.user?.email || null,
      action: "task.status_changed",
      target_type: "task",
      target_id: id,
      details: {
        from: prior?.status || null,
        to: status,
        notes: notes || null,
      },
    });

    if (status === "complete") {
      await logTaskCompletion(task);
    }

    // Re-estimate on status change (except complete)
    if (status !== "complete") {
      try {
        await triggerTasks.trigger("ai-estimate", { taskId: id });
      } catch (aiErr) {
        console.error("[admin/tasks] AI estimate trigger failed:", aiErr);
      }
    }

    const client = await getClientById(task.client_id);
    if (client) {
      const audience = await audienceForClientId(client.id);
      const allowed = await isNotificationEnabled(audience);
      if (allowed) {
        // For sales reps, the rep's email is in sales_reps (looked up via
        // client.sales_rep_id). client.email holds the BUSINESS email — sending
        // there would route to the wrong inbox or to a synthetic nomail address.
        let recipientEmail = client.email;
        let repFirstName: string | null = null;
        if (audience === "sales_rep" && client.sales_rep_id) {
          const supabase = createServerClient();
          const { data: rep } = await supabase
            .from("sales_reps")
            .select("email, first_name")
            .eq("id", client.sales_rep_id)
            .maybeSingle();
          if (rep && rep.email) {
            recipientEmail = rep.email;
            repFirstName = rep.first_name as string;
          } else {
            console.warn(
              `[admin/tasks] sales_rep audience but rep not found for client ${client.id}; falling back to client.email`,
            );
          }
        }

        try {
          if (status === "complete" && audience === "sales_rep") {
            // Tailored completion email — pull the deployed site URL from
            // the most recent build_jobs row for this task.
            const supabase = createServerClient();
            const { data: build } = await supabase
              .from("build_jobs")
              .select("site_url, wp_admin_url")
              .eq("task_id", id)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            await sendSalesRepCompletionEmail({
              to: recipientEmail,
              repFirstName: repFirstName || client.first_name || "there",
              businessName: client.company_name || client.first_name || "your client",
              siteUrl: (build?.site_url as string) || null,
              wpAdminUrl: (build?.wp_admin_url as string) || null,
              notes,
            });
          } else {
            await sendStatusChangeEmail(
              client,
              task,
              status as TaskStatus,
              notes,
              recipientEmail,
            );
          }
        } catch (emailErr) {
          console.error("[admin/tasks] Status email failed:", emailErr);
        }
      }
    }

    return NextResponse.json({ task });
  } catch (err) {
    console.error("[admin/tasks] Status update error:", err);
    return NextResponse.json(
      { error: "Failed to update status" },
      { status: 500 }
    );
  }
}

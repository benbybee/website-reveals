import { createServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin-auth";
import { NextResponse } from "next/server";

export async function DELETE() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const supabase = createServerClient();

  // Clients have CASCADE deletes on tasks, task_comments, task_status_history,
  // ai_velocity_log, and inbound_proposals — so this clears everything.
  const { error } = await supabase
    .from("clients")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000"); // delete all rows

  if (error) {
    console.error("[admin] Clear all clients failed:", error.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

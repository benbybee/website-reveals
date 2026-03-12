import { createServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin-auth";
import { NextResponse } from "next/server";

export async function DELETE() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const supabase = createServerClient();

  const { error } = await supabase
    .from("form_sessions")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000"); // delete all rows

  if (error) {
    console.error("[admin] Clear all submissions failed:", error.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

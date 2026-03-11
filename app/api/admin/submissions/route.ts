import { createServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin-auth";
import { NextResponse } from "next/server";

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("form_sessions")
    .select("*")
    .not("submitted_at", "is", null)
    .order("submitted_at", { ascending: false });

  if (error) {
    console.error("[admin] Failed to fetch submissions:", error.message);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }

  return NextResponse.json({ sessions: data });
}

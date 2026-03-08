import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const supabase = createServerClient();

  // Verify the session exists and was submitted
  const { data: session } = await supabase
    .from("form_sessions")
    .select("submitted_at")
    .eq("token", token)
    .single();

  if (!session?.submitted_at) {
    return NextResponse.json({ error: "No build found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("build_jobs")
    .select("id, form_type, status, repo_url, site_url, error, started_at, completed_at, created_at")
    .eq("token", token)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "No build found" }, { status: 404 });
  }

  return NextResponse.json(data);
}

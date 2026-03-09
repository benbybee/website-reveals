import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("form_sessions")
    .select("token, current_step, form_data, dns_provider, expires_at")
    .eq("token", token)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (new Date(data.expires_at) < new Date()) {
    return NextResponse.json({ error: "Session expired" }, { status: 410 });
  }

  return NextResponse.json(data);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const body = await req.json();
  const supabase = createServerClient();

  // Validate input types
  if (body.form_data !== undefined && (typeof body.form_data !== "object" || body.form_data === null)) {
    return NextResponse.json({ error: "form_data must be an object" }, { status: 400 });
  }

  if (body.current_step !== undefined && typeof body.current_step !== "number") {
    return NextResponse.json({ error: "current_step must be a number" }, { status: 400 });
  }

  // Reject updates to already-submitted sessions
  const { data: existing } = await supabase
    .from("form_sessions")
    .select("submitted_at")
    .eq("token", token)
    .single();

  if (existing?.submitted_at) {
    return NextResponse.json({ error: "Session already submitted" }, { status: 409 });
  }

  const { error } = await supabase
    .from("form_sessions")
    .update({
      current_step: body.current_step,
      form_data: body.form_data,
      dns_provider: body.dns_provider ?? null,
    })
    .eq("token", token);

  if (error) {
    console.error("[form] Update failed:", error.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

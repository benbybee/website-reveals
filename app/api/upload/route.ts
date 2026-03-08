import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const token = formData.get("token") as string | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const supabase = createServerClient();

  // Verify session exists
  if (token) {
    const { error } = await supabase
      .from("form_sessions")
      .select("token")
      .eq("token", token)
      .single();
    if (error) {
      return NextResponse.json({ error: "Invalid session" }, { status: 403 });
    }
  }

  const ext = file.name.split(".").pop() ?? "bin";
  const folder = token ? `sessions/${token}` : "anonymous";
  const filename = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  const { error: uploadError } = await supabase.storage
    .from("form-uploads")
    .upload(filename, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: urlData } = supabase.storage
    .from("form-uploads")
    .getPublicUrl(filename);

  // Append URL to session's file_urls array
  if (token) {
    await supabase.rpc("append_file_url", {
      p_token: token,
      p_url: urlData.publicUrl,
    });
  }

  return NextResponse.json({ url: urlData.publicUrl });
}

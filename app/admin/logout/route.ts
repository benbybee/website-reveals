import { createSSRClient } from "@/lib/supabase/server-ssr";
import { NextResponse } from "next/server";

export async function POST() {
  const supabase = await createSSRClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(
    new URL("/admin/login", process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000")
  );
}

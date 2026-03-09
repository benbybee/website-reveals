import { createSSRClient } from "@/lib/supabase/server-ssr";
import { NextResponse } from "next/server";

/**
 * Verify the caller is an authenticated admin.
 * Returns the user on success, or a 401 NextResponse on failure.
 */
export async function requireAdmin(): Promise<
  | { user: { email: string }; error?: never }
  | { user?: never; error: NextResponse }
> {
  const supabase = await createSSRClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const allowed = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase());

  if (!allowed.includes(user.email.toLowerCase())) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  return { user: { email: user.email } };
}

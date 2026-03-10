import { NextRequest, NextResponse } from "next/server";
import { authenticateClient, PORTAL_COOKIE } from "@/lib/portal-auth";

export async function POST(req: NextRequest) {
  try {
    const { email, pin } = await req.json();

    if (!email || !pin) {
      return NextResponse.json(
        { error: "Email and PIN are required" },
        { status: 400 }
      );
    }

    const result = await authenticateClient(email, pin);

    if ("error" in result) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(PORTAL_COOKIE, result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60,
      path: "/",
    });

    return response;
  } catch (err) {
    console.error("[portal/login] Error:", err);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}

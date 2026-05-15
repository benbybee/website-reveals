import { NextRequest, NextResponse } from "next/server";
import { authenticateSalesRep, SALES_REP_COOKIE } from "@/lib/sales-rep-auth";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { email, pin } = body as { email?: unknown; pin?: unknown };
  if (typeof email !== "string" || typeof pin !== "string") {
    return NextResponse.json({ error: "Email and PIN are required" }, { status: 400 });
  }

  const result = await authenticateSalesRep(email, pin);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SALES_REP_COOKIE, result.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
  return res;
}

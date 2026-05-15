import { NextResponse } from "next/server";
import { SALES_REP_COOKIE } from "@/lib/sales-rep-auth";

export async function POST() {
  const res = NextResponse.redirect(new URL("/sales-rep/login", process.env.NEXT_PUBLIC_SITE_URL || "https://www.websitereveals.com"));
  res.cookies.delete(SALES_REP_COOKIE);
  return res;
}

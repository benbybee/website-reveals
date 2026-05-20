import { updateSession } from "@/lib/supabase/middleware";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  // Portal route protection (client PIN-based JWT auth)
  const isPortalRoute =
    request.nextUrl.pathname.startsWith("/portal") &&
    !request.nextUrl.pathname.startsWith("/portal/login");

  if (isPortalRoute) {
    const token = request.cookies.get("portal_session")?.value;
    if (!token) {
      const url = request.nextUrl.clone();
      url.pathname = "/portal/login";
      return NextResponse.redirect(url);
    }
  }

  // Sales rep portal protection (separate JWT cookie)
  const isSalesRepRoute =
    request.nextUrl.pathname.startsWith("/sales-rep") &&
    !request.nextUrl.pathname.startsWith("/sales-rep/login");

  if (isSalesRepRoute) {
    const token = request.cookies.get("sales_rep_session")?.value;
    if (!token) {
      const url = request.nextUrl.clone();
      url.pathname = "/sales-rep/login";
      return NextResponse.redirect(url);
    }
  }

  // /sales-v2 is the new rep-authed questionnaire flow — gate it the same
  // way as /sales-rep. /sales (v1) stays public for back-compat.
  const isSalesV2Route = request.nextUrl.pathname.startsWith("/sales-v2");
  if (isSalesV2Route) {
    const token = request.cookies.get("sales_rep_session")?.value;
    if (!token) {
      const url = request.nextUrl.clone();
      url.pathname = "/sales-rep/login";
      url.searchParams.set("next", "/sales-v2");
      return NextResponse.redirect(url);
    }
  }

  // Admin route protection (Supabase auth)
  return await updateSession(request);
}

export const config = {
  matcher: ["/admin/:path*", "/portal/:path*", "/sales-rep/:path*", "/sales-v2/:path*"],
};

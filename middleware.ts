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

  // /sales is the canonical rep-authed questionnaire flow (scraper-driven).
  // Auth-gate the same way as /sales-rep. The pathname check uses an exact
  // "/sales" or "/sales/" prefix so it doesn't accidentally gate /sales-rep
  // (which has its own block above) or /sales-v2 (which is just a redirect
  // shim and must stay un-gated so the redirect runs before login).
  const path = request.nextUrl.pathname;
  const isSalesRoute = path === "/sales" || path.startsWith("/sales/");
  if (isSalesRoute) {
    const token = request.cookies.get("sales_rep_session")?.value;
    if (!token) {
      const url = request.nextUrl.clone();
      url.pathname = "/sales-rep/login";
      url.searchParams.set("next", "/sales");
      return NextResponse.redirect(url);
    }
  }

  // Admin route protection (Supabase auth)
  return await updateSession(request);
}

export const config = {
  // /sales is matched as "/sales" (exact) + "/sales/:path*" (subpaths). Listing
  // "/sales-v2" is intentionally omitted — the redirect at app/sales-v2/page.tsx
  // must run before any auth check so reps with stale tabs don't get bounced
  // through the login page just to be redirected away again.
  matcher: ["/admin/:path*", "/portal/:path*", "/sales-rep/:path*", "/sales", "/sales/:path*"],
};

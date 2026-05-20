import { redirect } from "next/navigation";

// /sales-v2 was the staging URL during the scraper-flow rollout. The canonical
// location is now /sales. Keep this thin redirect so any bookmarked tabs or
// stale links still land in the right place — middleware does NOT auth-gate
// this path, so the redirect happens before the login check and reps don't
// see a flash of the login page.
export default function SalesV2RedirectPage() {
  redirect("/sales");
}

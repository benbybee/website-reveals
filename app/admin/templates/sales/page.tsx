import { createSSRClient } from "@/lib/supabase/server-ssr";
import { redirect, notFound } from "next/navigation";
import { templatesEnabled } from "@/lib/templates/config";
import { tplDb } from "@/lib/templates/db";
import { SalesBoard, type SalesProspect } from "@/components/admin/templates/SalesBoard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sales — Template Sites" };

// Stages a rep can pick from the dropdown. `converted` is intentionally NOT here
// — it's reached only via the Convert action (captures owner data + fires the
// WR→SL conversion webhook), never a plain stage flip.
const SELECTABLE_STAGES = ["qualified", "approved", "building", "live", "build_failed"];
// Stages the board loads. Includes `converted` so closed-won prospects stay
// visible after conversion.
const BOARD_STAGES = [...SELECTABLE_STAGES, "converted"];

export default async function SalesPage() {
  if (!templatesEnabled()) notFound();

  const ssr = await createSSRClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) redirect("/admin/login");

  const db = tplDb();
  // Surface looked-up / opened engagement straight from the rollup counters on
  // tpl_prospects (lookup_count/last_looked_up_at when someone looks the business
  // up on /join, click_count/last_clicked_at when they open the preview site).
  // These replace the old per-mailing QR-scan signal.
  const [{ data }, { data: campRows }, { data: repRows }] = await Promise.all([
    db
      .from("tpl_prospects")
      .select("id, business_name, city, state, phone, website, stage, agent_id, sales_rep_id, preview_url, call_count, last_called_at, lookup_count, last_looked_up_at, click_count, last_clicked_at, sold_at, campaign_id")
      .in("stage", BOARD_STAGES)
      .is("suppressed_at", null) // suppressed leads are off the sales board too
      .neq("preview_url", "") // only leads whose site is generated — those are the ones reps call
      .order("updated_at", { ascending: false })
      .limit(500),
    db.from("tpl_campaigns").select("id, industry_slug").order("created_at", { ascending: false }),
    db.from("sales_reps").select("id, first_name, last_name"),
  ]);

  // Campaigns are per-industry, so the campaign filter doubles as the industry
  // filter (label = industry slug).
  const campaigns = ((campRows ?? []) as { id: string; industry_slug: string }[]).map((c) => ({
    id: c.id,
    label: c.industry_slug || c.id.slice(0, 8),
  }));

  // Resolve the assigned-rep id (sales_rep_id) → a display name for the board's
  // Rep column + filter. (Assignment is set in the campaign CRM via "Assign rep".)
  const reps = ((repRows ?? []) as { id: string; first_name: string | null; last_name: string | null }[]).map((r) => ({
    id: r.id,
    name: [r.first_name, r.last_name].filter(Boolean).join(" ").trim() || r.id.slice(0, 8),
  }));

  const prospects: SalesProspect[] = ((data ?? []) as Record<string, unknown>[]).map((p) => {
    return {
      id: p.id as string,
      business_name: (p.business_name as string) ?? null,
      city: (p.city as string) ?? null,
      state: (p.state as string) ?? null,
      phone: (p.phone as string) ?? null,
      website: (p.website as string) ?? null,
      stage: p.stage as string,
      agent_id: (p.agent_id as string) ?? null,
      sales_rep_id: (p.sales_rep_id as string) ?? null,
      preview_url: (p.preview_url as string) ?? null,
      lookup_count: (p.lookup_count as number) ?? 0,
      last_looked_up_at: (p.last_looked_up_at as string) ?? null,
      click_count: (p.click_count as number) ?? 0,
      last_clicked_at: (p.last_clicked_at as string) ?? null,
      call_count: (p.call_count as number) ?? 0,
      last_called_at: (p.last_called_at as string) ?? null,
      sold_at: (p.sold_at as string) ?? null,
      campaign_id: (p.campaign_id as string) ?? null,
    };
  });

  return (
    <div style={{ minHeight: "100vh", background: "#faf9f5", padding: "32px 24px 80px" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <SalesBoard prospects={prospects} userEmail={user.email ?? ""} stages={SELECTABLE_STAGES} campaigns={campaigns} reps={reps} />
      </div>
    </div>
  );
}

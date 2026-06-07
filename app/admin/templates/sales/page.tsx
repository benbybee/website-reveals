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
  // Embed mailings so the board can surface QR-scan activity: 90-95% of sales
  // come from prospects who scanned their mailed postcard, so reps need to see
  // who scanned vs. not. A prospect may have multiple mailings — we sum scan_count
  // and take the most recent last_scanned_at across them.
  const { data } = await db
    .from("tpl_prospects")
    .select("id, business_name, city, state, phone, website, stage, agent_id, record, call_count, last_called_at, tpl_mailings(scan_count, last_scanned_at)")
    .in("stage", BOARD_STAGES)
    .order("updated_at", { ascending: false })
    .limit(500);

  const prospects: SalesProspect[] = ((data ?? []) as Record<string, unknown>[]).map((p) => {
    const mailings = (p.tpl_mailings as { scan_count?: number; last_scanned_at?: string | null }[] | null) ?? [];
    const scanCount = mailings.reduce((sum, m) => sum + (m.scan_count ?? 0), 0);
    const lastScannedAt = mailings.reduce<string | null>((latest, m) => {
      if (!m.last_scanned_at) return latest;
      return !latest || m.last_scanned_at > latest ? m.last_scanned_at : latest;
    }, null);
    return {
      id: p.id as string,
      business_name: (p.business_name as string) ?? null,
      city: (p.city as string) ?? null,
      state: (p.state as string) ?? null,
      phone: (p.phone as string) ?? null,
      website: (p.website as string) ?? null,
      stage: p.stage as string,
      agent_id: (p.agent_id as string) ?? null,
      preview_url: ((p.record as { preview_url?: string } | null)?.preview_url) ?? null,
      scan_count: scanCount,
      last_scanned_at: lastScannedAt,
      call_count: (p.call_count as number) ?? 0,
      last_called_at: (p.last_called_at as string) ?? null,
    };
  });

  return (
    <div style={{ minHeight: "100vh", background: "#faf9f5", padding: "32px 24px 80px" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <SalesBoard prospects={prospects} userEmail={user.email ?? ""} stages={SELECTABLE_STAGES} />
      </div>
    </div>
  );
}

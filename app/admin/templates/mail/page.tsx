import { createSSRClient } from "@/lib/supabase/server-ssr";
import { redirect, notFound } from "next/navigation";
import { templatesEnabled, lobEnabled, lobIsTestMode } from "@/lib/templates/config";
import { tplDb } from "@/lib/templates/db";
import { MailSettings } from "@/components/admin/templates/MailSettings";
import type { PostcardDesign, ReturnAddress } from "@/lib/templates/mail/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mail settings — Template Sites" };

export default async function MailSettingsPage() {
  if (!templatesEnabled()) notFound();

  const ssr = await createSSRClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) redirect("/admin/login");

  const db = tplDb();
  const [{ data: designs }, { data: addresses }] = await Promise.all([
    db.from("tpl_postcard_designs").select("*").eq("archived", false).order("created_at", { ascending: false }),
    db.from("tpl_return_addresses").select("*").eq("archived", false).order("is_default", { ascending: false }),
  ]);

  return (
    <div style={{ minHeight: "100vh", background: "#faf9f5", padding: "32px 24px 80px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <MailSettings
          initialDesigns={(designs ?? []) as PostcardDesign[]}
          initialAddresses={(addresses ?? []) as ReturnAddress[]}
          lobConfigured={lobEnabled()}
          testMode={lobIsTestMode()}
        />
      </div>
    </div>
  );
}

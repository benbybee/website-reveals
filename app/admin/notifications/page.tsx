import { createSSRClient } from "@/lib/supabase/server-ssr";
import { redirect } from "next/navigation";
import { getAllNotificationSettings, AUDIENCE_LABELS, AUDIENCE_DESCRIPTIONS } from "@/lib/notification-settings";
import { NotificationSettingsShell } from "@/components/admin/NotificationSettingsShell";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Notifications — Website Reveals",
};

export default async function NotificationsPage() {
  const ssrClient = await createSSRClient();
  const {
    data: { user },
  } = await ssrClient.auth.getUser();
  if (!user) redirect("/admin/login");

  const settings = await getAllNotificationSettings();

  return (
    <div style={{ minHeight: "100vh", background: "#faf9f5", padding: "32px 24px 80px" }}>
      <div style={{ maxWidth: "900px", margin: "0 auto" }}>
        <NotificationSettingsShell
          settings={settings}
          labels={AUDIENCE_LABELS}
          descriptions={AUDIENCE_DESCRIPTIONS}
          userEmail={user.email || ""}
        />
      </div>
    </div>
  );
}

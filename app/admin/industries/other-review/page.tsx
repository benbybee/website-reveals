import { createSSRClient } from "@/lib/supabase/server-ssr";
import { createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { OtherReviewShell } from "@/components/admin/OtherReviewShell";

export const dynamic = "force-dynamic";

export const metadata = { title: "Other Review — Website Reveals" };

export default async function OtherReviewPage() {
  const ssr = await createSSRClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) redirect("/admin/login");

  const supabase = createServerClient();
  const { data } = await supabase
    .from("industry_other_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  return <OtherReviewShell initialEntries={data || []} />;
}

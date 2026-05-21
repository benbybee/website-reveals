import { createSSRClient } from "@/lib/supabase/server-ssr";
import { redirect, notFound } from "next/navigation";
import { listReferencesBySlug, listAliasesBySlug, getIndustryLabel, isValidIndustrySlug } from "@/lib/industries";
import { IndustryDetailShell } from "@/components/admin/IndustryDetailShell";

export const dynamic = "force-dynamic";

export const metadata = { title: "Industry — Website Reveals" };

export default async function IndustryDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const ssr = await createSSRClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) redirect("/admin/login");

  const { slug } = await params;
  if (!isValidIndustrySlug(slug) || slug === "other") notFound();

  const [references, aliases] = await Promise.all([
    listReferencesBySlug(slug),
    listAliasesBySlug(slug),
  ]);

  return (
    <IndustryDetailShell
      slug={slug}
      label={getIndustryLabel(slug)}
      initialReferences={references}
      initialAliases={aliases}
    />
  );
}

import { createServerClient } from "@/lib/supabase/server";

/**
 * Canonical industry catalog. Hardcoded because the list is stable; if a
 * category needs to be added, do it in code so the dropdown stays in sync
 * with the slug used everywhere downstream. The 11th option is "other" —
 * the rep types free text which is logged and admin can later map via the
 * industry_aliases table.
 */
export const INDUSTRY_CATEGORIES = [
  { slug: "home_services", label: "Home Services" },
  { slug: "health_wellness", label: "Health & Wellness" },
  { slug: "professional_services", label: "Professional Services" },
  { slug: "restaurants_food", label: "Restaurants & Food" },
  { slug: "retail", label: "Retail" },
  { slug: "beauty_personal_care", label: "Beauty & Personal Care" },
  { slug: "real_estate_property", label: "Real Estate & Property" },
  { slug: "fitness_sports_recreation", label: "Fitness, Sports & Recreation" },
  { slug: "education_coaching", label: "Education, Coaching & Courses" },
  { slug: "construction_trades", label: "Construction & Trades" },
  { slug: "other", label: "Other" },
] as const;

export type IndustrySlug = (typeof INDUSTRY_CATEGORIES)[number]["slug"];

export function isValidIndustrySlug(slug: string): slug is IndustrySlug {
  return INDUSTRY_CATEGORIES.some((c) => c.slug === slug);
}

export function getIndustryLabel(slug: string): string {
  return INDUSTRY_CATEGORIES.find((c) => c.slug === slug)?.label || slug;
}

export interface IndustryReference {
  id: string;
  industry_slug: string;
  url: string;
  label: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface IndustryAlias {
  id: string;
  industry_slug: string;
  alias_keyword: string;
  active: boolean;
  created_at: string;
}

export interface IndustryOtherLogRow {
  id: string;
  form_token: string | null;
  raw_text: string;
  resolved_industry_slug: string | null;
  status: "auto_mapped" | "admin_mapped" | "pending" | "ignored";
  resolved_at: string | null;
  created_at: string;
}

export async function listReferencesBySlug(slug: string): Promise<IndustryReference[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("industry_references")
    .select("*")
    .eq("industry_slug", slug)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Failed to list references: ${error.message}`);
  return (data || []) as IndustryReference[];
}

export async function listAliasesBySlug(slug: string): Promise<IndustryAlias[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("industry_aliases")
    .select("*")
    .eq("industry_slug", slug)
    .order("alias_keyword", { ascending: true });
  if (error) throw new Error(`Failed to list aliases: ${error.message}`);
  return (data || []) as IndustryAlias[];
}

/**
 * Resolve a chosen industry to its active reference URLs. For the fixed 10
 * categories, look up by slug. For "other", search aliases by substring
 * (alias_keyword found anywhere inside the lowercased rep-typed text).
 *
 * Returns the matched URLs and, when relevant, the alias info needed to
 * write a row to industry_other_log.
 */
export async function resolveIndustryReferences(args: {
  industrySlug: string;
  otherText?: string;
}): Promise<{
  urls: string[];
  matchedAlias?: { industry_slug: string; alias_keyword: string };
}> {
  const supabase = createServerClient();

  if (args.industrySlug !== "other") {
    if (!isValidIndustrySlug(args.industrySlug)) return { urls: [] };
    const { data } = await supabase
      .from("industry_references")
      .select("url")
      .eq("industry_slug", args.industrySlug)
      .eq("active", true);
    return { urls: (data || []).map((r) => r.url as string) };
  }

  // "other" path — try alias matching on the rep's free text
  const text = (args.otherText || "").trim().toLowerCase();
  if (!text) return { urls: [] };

  const { data: aliases } = await supabase
    .from("industry_aliases")
    .select("industry_slug, alias_keyword")
    .eq("active", true);

  const matched = (aliases || []).find((a) =>
    text.includes((a.alias_keyword as string).toLowerCase()),
  );
  if (!matched) return { urls: [] };

  const matchedSlug = matched.industry_slug as string;
  const matchedKeyword = matched.alias_keyword as string;

  const { data: refs } = await supabase
    .from("industry_references")
    .select("url")
    .eq("industry_slug", matchedSlug)
    .eq("active", true);

  return {
    urls: (refs || []).map((r) => r.url as string),
    matchedAlias: { industry_slug: matchedSlug, alias_keyword: matchedKeyword },
  };
}

/**
 * Log an "Other" submission. Called from submit-route every time the rep
 * picks Other, regardless of whether an alias matched. The status
 * encodes whether we auto-applied refs (auto_mapped) or left it pending
 * for admin review.
 */
export async function logOtherSubmission(args: {
  formToken: string;
  rawText: string;
  resolvedSlug: string | null;
  status: "auto_mapped" | "pending";
}): Promise<void> {
  const supabase = createServerClient();
  const { error } = await supabase.from("industry_other_log").insert({
    form_token: args.formToken,
    raw_text: args.rawText,
    resolved_industry_slug: args.resolvedSlug,
    status: args.status,
    resolved_at: args.status === "auto_mapped" ? new Date().toISOString() : null,
  });
  if (error) console.error("[industries] logOtherSubmission failed:", error.message);
}

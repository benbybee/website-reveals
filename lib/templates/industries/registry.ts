import type { SupabaseClient } from "@supabase/supabase-js";

// The canonical taxonomy for template BUILDING is tpl_industries. This registry
// exposes the "which industries can we actually build a template for" view —
// gap 1 (coverage gate) + gap 4 (single taxonomy). The rep picker offers only
// ready industries; the push guard drops anything not ready as defense-in-depth.

export interface ReadyIndustry {
  slug: string;
  display_name: string;
  sl_slug: string;
}

/** Industries with a live SL template (sl_template_ready), ordered for display. */
export async function templateReadyIndustries(db: SupabaseClient): Promise<ReadyIndustry[]> {
  const { data, error } = await db
    .from("tpl_industries")
    .select("slug, display_name, sl_slug")
    .eq("sl_template_ready", true)
    .order("display_name");
  if (error) throw error;
  return (data ?? []) as ReadyIndustry[];
}

/**
 * Set of sl_slugs (SL's controlled-vocabulary build key) that currently have a
 * live template. A record's industry_slug is stamped with the sl_slug (see
 * toBuildPayload), so the push coverage guard matches against THIS set — one
 * query, correct even when a tpl_industries slug differs from its sl_slug.
 */
export async function templateReadyBuildSlugs(db: SupabaseClient): Promise<Set<string>> {
  const ready = await templateReadyIndustries(db);
  return new Set(ready.map((r) => r.sl_slug));
}

/** True iff the given tpl_industries slug currently has a live SL template. */
export async function isTemplateReady(db: SupabaseClient, slug: string): Promise<boolean> {
  const { data } = await db
    .from("tpl_industries")
    .select("sl_template_ready")
    .eq("slug", slug)
    .maybeSingle();
  return Boolean((data as { sl_template_ready?: boolean } | null)?.sl_template_ready);
}

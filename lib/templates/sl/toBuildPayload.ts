import type { CanonicalRecord } from "../types";
import { slTemplatePhotosEnabled } from "../config";

export type SlFormType = "quick" | "standard" | "in-depth";

/**
 * SL's per-build `brief` — flat snake_case keys, the ONLY object the wr-template
 * mapper reads. Sibling fields (external_id/form_type) ride alongside but aren't
 * part of the brief; source_id is sent as the x-source-id header, not the body.
 */
export interface BuildBrief {
  business_name: string;
  industry: string;
  what_you_do?: string; // → business.description
  all_services?: string; // → services
  address?: string;
  contact_phone?: string;
  contact_email?: string; // optional on the Template path
  logo_url?: string; // dynamic business asset
  brand_colors?: string[];
  // C2 (ADR 0007): own-site + place photos, mapped to template slots. Additive
  // and flag-gated by SL_TEMPLATE_PHOTOS_ENABLED — omitted entirely (byte-
  // identical to the pre-photos brief) until SL templates declare photo slots.
  photos?: { url: string; slot?: string; alt?: string }[];
}

export interface BuildPayload {
  external_id: string; // dedup key — stable per prospect (source_id)
  form_type: SlFormType;
  brief: BuildBrief;
}

function flattenAddress(a?: CanonicalRecord["address"]): string | undefined {
  if (!a) return undefined;
  const stateZip = [a.state, a.zip].filter((s) => s && s.trim()).join(" ");
  const line = [a.street, a.city, stateZip].filter((s) => s && s.trim()).join(", ");
  return line.trim() || undefined;
}

/**
 * Map a canonical prospect record → SL's per-build /api/builds body.
 *
 * Owner/kura is intentionally omitted — the Template path no longer requires it;
 * kura (owner_email/name/slug) is a Stage-2 conversion input supplied when a
 * prospect converts, not at intake.
 *
 * NOTE: Photos are OFF by default. brief.photos[] is additive and gated by
 * SL_TEMPLATE_PHOTOS_ENABLED (ADR 0007) — until the flag is on (and SL templates
 * declare photo slots), only business info + logo + colors are injected and the
 * brief is byte-identical to the pre-photos shape. Empty slots fall back to
 * stock bundled in the SL template.
 */
export function toBuildPayload(r: CanonicalRecord, formType: SlFormType = "quick"): BuildPayload {
  const brief: BuildBrief = {
    business_name: r.business_name,
    // SL selects the template by EXACT-matching brief.industry against each
    // template's industries[] (sitelaunchr-builder select.mjs). So we must emit
    // SL's controlled-vocabulary slug — discover stamps it as industry_slug
    // (= the tpl_industries sl_slug) for exactly this handoff. industry_raw is
    // the cosmetic Google category ("Pest control service") and never matches a
    // template slug; it stays only as a last-resort fallback so the field is
    // never empty.
    industry: r.industry_slug || r.industry_raw || "",
  };
  if (r.description) brief.what_you_do = r.description;
  const services = (r.services ?? []).map((s) => s.name).filter((n) => n && n.trim());
  if (services.length) brief.all_services = services.join(", ");
  const address = flattenAddress(r.address);
  if (address) brief.address = address;
  if (r.phone) brief.contact_phone = r.phone;
  if (r.email) brief.contact_email = r.email;
  if (r.logo?.src_url) brief.logo_url = r.logo.src_url;
  const colors = r.brand_colors
    ? Object.values(r.brand_colors).filter((c): c is string => typeof c === "string" && c.trim().length > 0)
    : [];
  if (colors.length) brief.brand_colors = colors;

  // C2 photos[] — only when the flag is on AND the record has photos.
  if (slTemplatePhotosEnabled() && r.photos?.length) {
    brief.photos = r.photos.map((p) => {
      const photo: { url: string; slot?: string; alt?: string } = { url: p.src_url };
      if (p.slot) photo.slot = p.slot;
      if (p.alt) photo.alt = p.alt;
      return photo;
    });
  }

  return { external_id: r.source_id, form_type: formType, brief };
}

/** SL's hard-required fields for a Template build (owner/contact NOT required). */
export function validateBuildPayload(p: BuildPayload): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!nonEmpty(p.external_id)) missing.push("external_id");
  if (!nonEmpty(p.form_type)) missing.push("form_type");
  if (!nonEmpty(p.brief?.business_name)) missing.push("brief.business_name");
  if (!nonEmpty(p.brief?.industry)) missing.push("brief.industry");
  return { ok: missing.length === 0, missing };
}

function nonEmpty(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

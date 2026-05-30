import type { PrepBrief } from "./toPrepBrief";

/**
 * Validate a prep.brief artifact against SL's required contract: business name,
 * industry_slug, contact address (street/city/state) + phone, and the documented
 * 4-key brand.colors shape when colors are present.
 */
export function validatePrepBrief(p: PrepBrief): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  const b = p.brief;

  if (!nonEmpty(b?.business?.name)) missing.push("brief.business.name");
  if (!nonEmpty(b?.business?.industry_slug)) missing.push("brief.business.industry_slug");

  const addr = b?.contact?.address;
  if (!addr || !nonEmpty(addr.street) || !nonEmpty(addr.city) || !nonEmpty(addr.state)) {
    missing.push("brief.contact.address");
  }
  if (!nonEmpty(b?.contact?.phone)) missing.push("brief.contact.phone");

  const colors = b?.brand?.colors;
  if (colors) {
    for (const key of ["primary", "accent", "neutral_dark", "neutral_light"] as const) {
      if (!nonEmpty(colors[key])) missing.push(`brief.brand.colors.${key}`);
    }
  }

  return { ok: missing.length === 0, missing };
}

function nonEmpty(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

import type { CanonicalRecord } from "../types";

const REQUIRED = ["source_id", "business_name", "industry_slug", "address", "phone"] as const;

export interface ScoreResult {
  missing: string[];
  completeness: number;
  confidence: number;
}

export function scoreRecord(r: CanonicalRecord): ScoreResult {
  const missing: string[] = [];
  for (const k of REQUIRED) if (!present((r as Record<string, unknown>)[k])) missing.push(k);
  const hasAddr = !!r.address && present(r.address.street) && present(r.address.city) && present(r.address.state);
  if (!hasAddr && !missing.includes("address")) missing.push("address");
  const hasAsset = !!r.logo?.src_url || (r.photos?.length ?? 0) > 0;
  if (!hasAsset) missing.push("logo_or_photos");

  // identity anchor = name + full address + phone
  let anchor = 0;
  if (present(r.business_name)) anchor += 0.34;
  if (hasAddr && present(r.address.zip)) anchor += 0.33;
  if (r.phone) anchor += 0.33;

  const allFields = [...REQUIRED, "logo_or_photos", "hours", "services", "brand_colors", "email"];
  const filled = allFields.filter((f) => !missing.includes(f) && presentField(r, f)).length;
  return { missing, completeness: round2(filled / allFields.length), confidence: round2(anchor) };
}

export function isQualified(s: ScoreResult): boolean {
  return s.missing.length === 0;
}

function present(v: unknown): boolean {
  return v != null && (typeof v !== "string" || v.trim().length > 0);
}
function presentField(r: CanonicalRecord, f: string): boolean {
  if (f === "logo_or_photos") return !!r.logo?.src_url || (r.photos?.length ?? 0) > 0;
  if (f === "hours") return (r.hours?.length ?? 0) > 0;
  if (f === "services") return (r.services?.length ?? 0) > 0;
  if (f === "brand_colors") return !!r.brand_colors?.primary;
  return present((r as Record<string, unknown>)[f]);
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

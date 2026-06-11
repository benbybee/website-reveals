// Merge logic for admin prospect edits (PATCH /api/templates/prospects/[id]).
//
// The promoted columns (business_name, city, state, phone, website,
// website_status) are derived COPIES of the canonical `record` JSONB — the
// record is what scoring, the SL push, the mail send, and the list/export
// filters read. An edit surface that updates the copy but not the source
// silently diverges the system, so every scalar edit is mirrored into the
// record here. street/zip have no promoted column and live only on
// record.address.

/** Drawer-editable scalars. city/state/street/zip land on record.address. */
export const EDITABLE_FIELDS = [
  "business_name",
  "phone",
  "website",
  "website_status",
  "street",
  "city",
  "state",
  "zip",
] as const;
export type EditableField = (typeof EDITABLE_FIELDS)[number];

/** The subset that also exists as a promoted tpl_prospects column. */
export const PROMOTED_COLUMNS = ["business_name", "city", "state", "phone", "website", "website_status"] as const;

const RECORD_SCALARS = ["business_name", "phone", "website", "website_status"] as const;
const ADDRESS_PARTS = ["street", "city", "state", "zip"] as const;

/**
 * Build the merged `record` for an edit. Precedence (lowest to highest):
 * existing record -> synced field edits -> an explicit body.record patch
 * (explicit record writes are the power-user path and always win).
 * Returns null when nothing touches the record (no edit, no patch).
 */
export function mergeRecordEdit(
  existing: Record<string, unknown> | null | undefined,
  fields: Partial<Record<EditableField, string>> | undefined,
  recordPatch: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  const scalarEdits: Record<string, string> = {};
  const addressEdits: Record<string, string> = {};
  for (const k of RECORD_SCALARS) {
    const v = fields?.[k];
    if (typeof v === "string") scalarEdits[k] = v;
  }
  for (const k of ADDRESS_PARTS) {
    const v = fields?.[k];
    if (typeof v === "string") addressEdits[k] = v;
  }

  const hasScalars = Object.keys(scalarEdits).length > 0;
  const hasAddress = Object.keys(addressEdits).length > 0;
  const hasPatch = !!recordPatch && typeof recordPatch === "object";
  if (!hasScalars && !hasAddress && !hasPatch) return null;

  const base = (existing ?? {}) as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...base, ...scalarEdits, ...(hasPatch ? recordPatch : {}) };

  if (hasAddress) {
    const baseAddr = (base.address ?? {}) as Record<string, unknown>;
    const patchAddr = hasPatch && recordPatch && typeof recordPatch.address === "object" && recordPatch.address
      ? (recordPatch.address as Record<string, unknown>)
      : {};
    merged.address = { ...baseAddr, ...addressEdits, ...patchAddr };
  }

  return merged;
}

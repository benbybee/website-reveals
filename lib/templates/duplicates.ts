// Duplicate detection for the campaign list cleaner. Pure + testable: group
// prospects by a normalized business name, keep one representative per group,
// and mark the rest for removal — but NEVER remove a lead that already has a
// site generated (that one is the keeper).

export interface DupRow {
  id: string;
  business_name: string | null;
  preview_url: string | null;
  stage: string;
  phone: string | null;
  city: string | null;
  website: string | null;
  created_at: string | null;
}

export interface DupGroup {
  name: string; // the kept lead's display name
  keepId: string;
  removeIds: string[];
  removeNames: string[];
  total: number; // group size (copies found)
}

export interface DupResult {
  groups: DupGroup[];
  removeIds: string[]; // flat list of every id to remove
  removable: number;
}

/**
 * Normalize a business name for duplicate matching: lowercase, strip punctuation,
 * drop common entity-suffix noise (LLC/Inc/…), collapse whitespace. So
 * "ABC Plumbing, LLC" and "abc  plumbing inc" collide.
 */
export function normalizeName(name: string | null | undefined): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(llc|inc|incorporated|co|corp|ltd|company|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A lead "has a site" — and is therefore protected from duplicate removal — if it
 * has a generated preview URL or is in the build pipeline (building/live).
 */
export function hasSite(r: DupRow): boolean {
  return !!(r.preview_url && r.preview_url.trim()) || r.stage === "building" || r.stage === "live";
}

function completeness(r: DupRow): number {
  return (r.phone ? 1 : 0) + (r.city ? 1 : 0) + (r.website ? 1 : 0);
}

/**
 * Group rows by normalized name; for each group of 2+, keep one and mark the
 * rest for removal. Site-generated leads are never removed: if a group has one,
 * it's the keeper and all non-sited copies go; if a group is ALL sited, nothing
 * is removed. Otherwise keep the most complete (then oldest) copy.
 */
export function computeDuplicateGroups(rows: DupRow[]): DupResult {
  const byKey = new Map<string, DupRow[]>();
  for (const r of rows) {
    const key = normalizeName(r.business_name);
    if (!key) continue; // can't dedup nameless rows
    const arr = byKey.get(key) ?? [];
    arr.push(r);
    byKey.set(key, arr);
  }

  const groups: DupGroup[] = [];
  const removeIds: string[] = [];
  for (const members of byKey.values()) {
    if (members.length < 2) continue;
    const sited = members.filter(hasSite);
    const plain = members.filter((m) => !hasSite(m));

    let keepId: string;
    let toRemove: DupRow[];
    if (sited.length > 0) {
      // A site-generated copy exists — keep it, remove every non-sited copy.
      keepId = sited[0].id;
      toRemove = plain;
    } else {
      // No site anywhere — keep the most complete (then oldest), remove the rest.
      const sorted = [...plain].sort(
        (a, b) => completeness(b) - completeness(a) || (a.created_at ?? "").localeCompare(b.created_at ?? ""),
      );
      keepId = sorted[0].id;
      toRemove = sorted.slice(1);
    }
    if (toRemove.length === 0) continue; // all-sited group → nothing to remove

    const keepRow = members.find((m) => m.id === keepId);
    groups.push({
      name: keepRow?.business_name ?? "(unnamed)",
      keepId,
      removeIds: toRemove.map((r) => r.id),
      removeNames: toRemove.map((r) => r.business_name ?? "(unnamed)"),
      total: members.length,
    });
    removeIds.push(...toRemove.map((r) => r.id));
  }

  groups.sort((a, b) => b.removeIds.length - a.removeIds.length); // most-duplicated first
  return { groups, removeIds, removable: removeIds.length };
}

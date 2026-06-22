// The sales-pipeline status a rep/operator sets on a template lead. Single source
// of truth for the dropdown options, the API validation, and the display label,
// so the rep portal, the admin board, and the endpoints can't drift.

export interface LeadStatusOption {
  value: string;
  label: string;
}

export const LEAD_STATUSES: LeadStatusOption[] = [
  { value: "new", label: "New" },
  { value: "no_answer", label: "No Answer" },
  { value: "follow_up", label: "Follow Up Needed" },
  { value: "scheduled_demo", label: "Scheduled Demo" },
  { value: "contacted", label: "Contacted" },
  { value: "not_interested", label: "Not Interested" },
  { value: "sold", label: "Mark Sold" },
];

export const DEFAULT_LEAD_STATUS = "new";
const VALUES = new Set(LEAD_STATUSES.map((s) => s.value));

export function isValidLeadStatus(v: unknown): v is string {
  return typeof v === "string" && VALUES.has(v);
}

export function leadStatusLabel(v: string | null | undefined): string {
  return LEAD_STATUSES.find((s) => s.value === v)?.label ?? "New";
}

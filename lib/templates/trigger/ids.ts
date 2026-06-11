// Trigger.dev task IDs for the Template Site pipeline. The API routes dispatch
// by these strings; the Phase 6 task definitions (src/trigger/templates/*) must
// register with the same IDs. Centralized so the two sides cannot drift.
export const TPL_TASK_IDS = {
  discover: "tpl-discover",
  enrich: "tpl-enrich",
  enrichBatch: "tpl-enrich-batch",
  deepAudit: "tpl-deep-audit",
  backfill: "tpl-backfill",
  mailCampaign: "tpl-mail-campaign",
} as const;

// Apify actor IDs each enrichment stage spends against — used for cost estimates.
export const DEEP_AUDIT_ACTORS = [
  "accurate_pouch/tech-stack-detector",
  "nexgendata/google-lighthouse-checker",
] as const;

export const BACKFILL_ACTOR = "compass/crawler-google-places";

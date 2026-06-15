# Feature — Sales CRM & Rep Portal

> The sales-rep surface that spans both spines: rep-submitted prospects, call logging, and prospect conversion.

## What a rep can do
- **Submit a prospect** via `/sales` (`sales-v2/scrape` + `intakeSalesProspect`) → lands in a `kind=sales` `tpl_campaign`, **held** until an operator confirms a template exists for the industry ([L1 sales arm](../loops/intake-onboarding.md)).
- **Work the board**: `tpl_prospects` denormalized rollups (`call_count`, `last_called_at`, stage) give an at-a-glance CRM view.
- **Log activity**: `templates/sales/activity` → `tpl_sales_activity` (`kind` = stage_change | note | call; `outcome` = no_answer | voicemail | connected | callback | not_interested | wrong_number).
- **Convert**: `/prospects/[id]/convert` captures owner data + fires the conversion ([C3](../contracts/c3-sitelaunchr-conversions.md)).
- **Task outcomes** (the agency-ops side): `sales-rep/tasks/[id]/outcome` (sold | not_needed) + comments.

## Identity
PIN → HS256 JWT (`sales_rep_session`). `sales_reps` rows; clients reference a `sales_rep_id`. `form_sessions.sales_rep_id` records who submitted on a client's behalf (immutable history).

## Where it meets the rest
- Conversion ties the rep into the GTM → Kura handoff.
- Task outcomes tie the rep into the agency-ops task lifecycle.
- The rep is the human in several loops' escalation paths.

## Gaps
`tpl_prospects.agent_id` is a soft reference (no FK) — rep deletion orphans it (G-DATA1); sales-campaign name-collision fallback is fuzzy; rep PIN stored plaintext for admin display (G-SEC2). See [gap matrix](../gap-matrix.md).

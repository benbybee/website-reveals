# Data Flows

## Inbound: client → live site
```
client fills form (form_sessions)
  → submit: resolve form_type, shouldRouteToSiteLaunchr?
     ├─ yes → dispatchBuild (C1, source wr) → build_jobs(queued)
     │         → SL builds → callback (C4) → build_jobs(live), task→review
     │         → admin approves (Telegram/admin) → task complete → client email (L7)
     │         → cost on phase=live → build_jobs.cost_usd → invoice (L5)
     └─ no  → intakeSalesProspect → tpl_prospects (sales campaign, held)
  → Dispatchr submission.new / build.dispatched / build.live (C5)
```

## Outbound: campaign → conversion → Kura
```
campaign (tpl_campaigns)
  → tpl-discover (Apify) → tpl_prospects(scraped) + tpl_cost_events
  → tpl-enrich → tpl-enrich-batch (Apify FB + Firecrawl DNA) → score gate
     → qualified | incomplete
  → push (C2, source wr-template, dry-run→send) → tpl_sl_batches → SL preview build
     → callback (C4) → tpl_prospects(building→live)
  → mail-campaign (Lob/C2M, dry-run→send) → tpl_mailings + QR token
     → recipient scans /r/[token] → tpl_qr_scans + scan_count (L7)
  → sales rep calls (tpl_sales_activity) → prospect says yes
  → convert (C3) → SL /api/conversions → SL dispatches Kura promote
```

## Inbound message → task (AI)
```
email/Slack → inline Claude → inbound_proposals(pending)
  → Telegram admin approve → tasks row (L6)
```

## Recovery & housekeeping (cron)
```
reconcile-sl-builds   → stuck build_jobs → Dispatchr build.stuck + Telegram (L8)
notify-abandoned-...  → idle form_sessions → email + Dispatchr submission.abandoned
archive-completed-... → old complete tasks → archived_at
```

## Canonical record note
A prospect's truth is its `tpl_prospects.record` JSONB (the canonical CRM record). Promoted columns (`city`, `state`, …) are denormalized for querying; drawer edits now mirror into `record` so the canonical source and the columns stay consistent ([ADR 0004](../decisions/0004-prospect-filters-single-source.md)). The SL build payload is mapped from `record` only.

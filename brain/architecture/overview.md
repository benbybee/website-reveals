# Architecture Overview

## Stack
- **Web/API:** Next.js (App Router). API routes under `app/api/**`; UI under `app/` + `components/`; shared logic in `lib/`. `middleware.ts` gates auth.
- **Background:** Trigger.dev v3 (`src/trigger/**`), project `proj_peoqklwfpgsdsfttdwhr`, deployed via pinned CLI.
- **Data:** Supabase Postgres (41 migrations) + Storage buckets (`form-uploads`, `tpl-postcards`). Server uses the service-role key; RLS is minimal.
- **Hosting:** Vercel (auto-deploy on `main`) + Vercel Cron for scheduled routes.

## Shape
WR is a **modular monolith** with two business spines (inbound agency ops + outbound Template GTM) sharing one Next.js app, one Supabase database, one Trigger.dev project, and two partner integrations (SiteLaunchr, Dispatchr). The spines are separated by table prefix (`tpl_*` = GTM) and by role surface, and they converge at SiteLaunchr (two source identities) and the sales-rep.

## Layering
```
HTTP routes (app/api/**)  ── thin: auth, parse, call lib, return
   │
lib/** (domain logic)     ── mappers, validators, gates, signers, db helpers
   │
src/trigger/** (async)    ── long/scheduled work; calls the same lib/**
   │
Supabase (data) + partner HTTP (SiteLaunchr/Dispatchr) + vendors (Apify/Firecrawl/Lob/C2M/Resend/Telegram/Anthropic)
```
Doctrine: routes stay thin; seam payloads are built by one mapper + one validator in `lib/**` ([Pattern P1](../standards/pattern-library.md)); Trigger tasks reuse the same `lib/**`, never re-implement.

## Key cross-cutting mechanisms
- **HMAC envelope** (`lib/sitelaunchr.ts`) signs all outbound SL requests and verifies inbound callbacks (±300s freshness). One signer/verifier.
- **Idempotency** everywhere a seam is crossed (`external_id` = `source_id`).
- **Fan-out** for heavy async (enrich parent → child batches) to dodge task duration limits.
- **Dry-run before send** on every irreversible batch (SL push, mail).
- **Fire-and-forget** for observability/notifications (Dispatchr, Resend, Telegram) — explicitly NOT for state-changing seams.

## See also
[Boundaries & trust zones](./boundaries.md) · [Data flows](./data-flows.md) · [Subsystem map](../subsystem-map.md) · [Contracts](../contracts/README.md)

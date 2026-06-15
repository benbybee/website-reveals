# Integrations — Vendors

> Third-party APIs WR calls (locality: **vendor**). Distinct from the co-owned partner [contracts](../contracts/README.md) (SiteLaunchr/Dispatchr/Kura), which are Tier 3 distributed seams. Vendor seams are outbound dependencies driven by the vendor's own changelog.

| Vendor | Use | Auth / env | Config | Test/sandbox |
|---|---|---|---|---|
| **Anthropic (Claude)** | task estimation, inbound→proposal, AI wizard chat | `ANTHROPIC_API_KEY` | `lib/ai-wizard-prompt.ts`, `lib/anthropic-pricing.ts` | — (no 429 backoff — gap) |
| **Trigger.dev v3** | all async/scheduled work | `TRIGGER_SECRET_KEY`; dashboard-synced: `APIFY_TOKEN`, `FIRECRAWL_API_KEY`, `LOB_*` | `trigger.config.ts` (`SYNCED_ENV_VARS`) | dev vs prod env |
| **Apify** | Google Places scrape (discover), Facebook (enrich) | `APIFY_TOKEN` | `lib/templates/apify/*`, `lib/templates/config.ts` | — |
| **Firecrawl** | brand DNA (logo + colors) at enrich | `FIRECRAWL_API_KEY`, `FIRECRAWL_USD_PER_CREDIT` | `lib/firecrawl.ts` | — |
| **Lob** | direct-mail postcards | `LOB_API_KEY` (HTTP Basic), `LOB_UNIT_USD_*` | `lib/templates/mail/*` | `test_` key = test mode |
| **Click2Mail (MOL Pro)** | alt postcard provider | `C2M_USERNAME`/`C2M_PASSWORD` (HTTP Basic) | `lib/templates/config.ts` | `stage-rest.click2mail.com` = sandbox |
| **Resend** | transactional/notification email | `RESEND_API_KEY` | `lib/task-emails.ts` | — |
| **Telegram Bot** | admin approval + alerts | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_ID` | webhook route + send helper | — |
| **Slack** | inbound intake events | `SLACK_SIGNING_SECRET`, `SLACK_BOT_TOKEN` | `lib/slack.ts` | — |
| **Vercel** | hosting + cron | `CRON_SECRET` | `vercel.json` | — |

## Sandbox-gating patterns ([Pattern P9](../standards/pattern-library.md))
- **Lob:** key prefix `test_` vs `live_` selects mode.
- **Click2Mail:** base-URL string match (`stage-rest.` = sandbox) — fragile across URL changes (gap noted).
- There is no single "is this a test run" flag across all vendors; sandbox logic is scattered in `config.ts` helpers.

## Vendor risks (from discovery)
- No retry/backoff on Anthropic 429; Apify has a 5-min outer timeout but intermediate polling failures degrade silently; Click2Mail response parsing uses a minimal regex (fragile). See the [gap matrix](../gap-matrix.md) cross-cutting section.

## Why these aren't contracts
A vendor seam has a published spec WR conforms to; WR cannot change it and no partner repo depends on WR's payloads. A [contract](../contracts/README.md) is co-owned with a partner repo where a change on either side can break the other. Promoting a vendor to a contract (or vice-versa) is an ADR-worthy reclassification.

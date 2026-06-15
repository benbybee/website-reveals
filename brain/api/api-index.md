# API Index

> ~95 routes across 11 subsystems, grouped by trust zone ([boundaries](../architecture/boundaries.md)). This is a map, not an exhaustive reference — each route handler in `app/api/**` is the authority for its own contract.

## Public / token-scoped (no login)
| Route | Purpose |
|---|---|
| `POST /api/form/start`, `GET/PUT /api/form/[token]`, `POST /api/form/[token]/submit`, `.../save-email` | questionnaire lifecycle |
| `POST /api/upload` | file upload to `form-uploads` |
| `GET /api/builds/[token]` | build status by token |
| `GET /api/export/[token]` | submission export |
| `GET /api/r/[token]` (`app/r/[token]`) | QR scan → log + redirect to preview |

## Partner callbacks (HMAC-verified, ±300s)
| Route | Purpose | Contract |
|---|---|---|
| `POST /api/sl-callback` | `wr` build status + cost → `build_jobs` | [C4](../contracts/c4-sitelaunchr-callbacks.md) |
| `POST /api/templates/sl-callback` | `wr-template` build status → `tpl_prospects` | [C4](../contracts/c4-sitelaunchr-callbacks.md) |

## External webhooks
| Route | Gate |
|---|---|
| `POST /api/webhooks/submit` | HMAC (`webhook-auth`) + rate limit |
| `POST /api/integrations/slack/events` | Slack signature |
| `POST /api/integrations/email/inbound` | Resend trusted source |
| `POST /api/integrations/telegram/webhook` | chat-id allowlist (`TELEGRAM_ADMIN_CHAT_ID`) |

## Cron (`CRON_SECRET` bearer)
| Route | Loop |
|---|---|
| `GET /api/cron/reconcile-sl-builds` | [L8 stuck-build recovery](../loops/stuck-build-recovery.md) |
| `GET /api/cron/notify-abandoned-submissions` | abandonment ([L7](../loops/notification.md)) |
| `GET /api/cron/archive-completed-tasks` | task archival |

## Admin (`requireAdmin`)
- Tasks: `admin/tasks` (+ `[id]`, `/status`, `/comments`, `/time`, `/permanent`)
- Clients: `admin/clients` (+ `[id]`, `/reset-pin`, `/bulk-assign`, `/clear`)
- Sales reps: `admin/sales-reps` (+ `[id]`, `/reset-pin`)
- Submissions: `admin/submissions` (+ `[id]`, `/export`, `/clear`)
- Builds: `admin/stuck-builds`, `admin/build/resubmit`
- Billing: `admin/billing/invoices` (+ `[id]/paid`)
- Settings: `admin/notification-settings`
- Industries: `admin/industries/[slug]/references|aliases`, `.../other-log/[id]`

## Templates / GTM (`requireAdmin`)
- Campaigns: `templates/campaigns` (+ `[id]`, `/run`, `/push`, `/mail`, `/scans`, `/prospects`, `/export`, `/deep-audit`)
- Prospects: `templates/prospects/[id]` (+ `/convert`), `/bulk`, `/backfill`
- Mail assets: `templates/postcard-designs` (+ `[id]`, `/sign-upload`), `templates/return-addresses` (+ `[id]`)
- `templates/industries` (+ `[slug]`), `templates/sales/activity`

## Portal & sales-rep (PIN-JWT)
- `portal/login|logout`, `portal/tasks` (+ `[id]/comments`)
- `sales-rep/login|logout`, `sales-rep/tasks/[id]/comments|outcome`, `sales-v2/scrape`

## AI
- `POST /api/ai-wizard/chat` — streaming SSE (unauthenticated by design; see gap matrix for scope notes)

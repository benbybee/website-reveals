# Boundaries & Trust Zones

## Trust zones (how a request is authorized)
| Zone | Routes | Gate |
|---|---|---|
| **Public, token-scoped** | `form/*`, `builds/[token]`, `export/[token]` (some), QR `r/[token]`, `upload` | possession of an unguessable token; no login |
| **Admin** | `app/api/admin/**`, all `app/api/templates/**` | `requireAdmin` — Supabase auth, email in `ADMIN_EMAILS` |
| **Client portal** | `portal/**` | PIN → HS256 JWT cookie (`portal_session`) |
| **Sales-rep portal** | `sales-rep/**`, `sales-v2/scrape` | PIN → HS256 JWT cookie (`sales_rep_session`) |
| **Partner callback (signed)** | `sl-callback`, `templates/sl-callback` | HMAC verify + ±300s freshness |
| **External webhook** | `webhooks/submit`, `integrations/slack`, `integrations/email`, `integrations/telegram` | HMAC / Slack signature / trusted-source + chat-id allowlist |
| **Cron** | `cron/**` | `CRON_SECRET` bearer (optional — see G) |

## Ownership boundaries
- **GTM machine** = everything `tpl_*` (14 tables) + `src/trigger/templates/**` + `lib/templates/**` + `app/api/templates/**`. Self-contained except for the SL seams and vendor scrapers.
- **Agency-ops core** = onboarding, build pipeline, tasks, billing, AI/notify. Owns `form_sessions`, `build_jobs`, `tasks`, `clients`, `invoices`.
- The two meet at **SiteLaunchr** (sources `wr` vs `wr-template`) and the **sales-rep** role (works both task outcomes and prospect conversions).

## Distributed boundaries (Tier 3)
Three boundaries cross into separately-owned repos — these are [contracts](../contracts/README.md), not internal calls:
- WR ⇄ **SiteLaunchr** (C1–C4)
- WR → **Dispatchr** (C5)
- WR → **Kura**, only via SL `/api/conversions` (C3) — no direct seam.

Local tooling cannot observe the partner side of these boundaries; that is the central fact driving the [maintenance engine](../maintenance/maintenance-engine.md).

## Known boundary risks
- RLS is service-role-only (G-SEC1): the DB does not enforce the zone table above — the middleware/route layer does. A stray anon key has no DB guard.
- Cron `CRON_SECRET` is optional; unset = public cron routes (G).
- Trusted-source webhooks (email/Telegram) rely on source trust + allowlist rather than signature.

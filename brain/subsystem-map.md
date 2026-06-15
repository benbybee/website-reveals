# Subsystem Relationship Map

> The 11 subsystems and how they relate. Grounded in the discovery pass. Boundaries detailed in [architecture/boundaries.md](./architecture/boundaries.md).

## The two spines
WR is two pipelines sharing infrastructure (Supabase, Trigger.dev, SiteLaunchr, Dispatchr, notifications):

```
INBOUND (client-initiated)
  Onboarding/Intake ──> Build Pipeline ──C1──> SiteLaunchr ──C4──> Build Pipeline
        │                     │                                        │
        │                     └──> Admin Dashboard (tasks) <── AI Wizard/Notify
        │                                                              │
        └──> Auth (client PIN) ──> Client Portal                   Billing

OUTBOUND (WR-initiated GTM)
  Template GTM: Campaign ──tpl-discover──> Prospects ──tpl-enrich/-batch──> Qualify gate
        │                                                              │
        │                                            (qualified) ──C2──> SiteLaunchr ──C4──> stage=live
        │                                                              │
        └──> Mail (Lob/Click2Mail) ──> QR scans ──> Sales-Rep Portal ──convert──C3──> SL ──> Kura
```

Both spines emit **C5 Dispatchr** lifecycle events for observability.

## Subsystem table
| Subsystem | Owns | Talks to | Data |
|---|---|---|---|
| **Onboarding & Intake** | questionnaire sessions, file uploads, submission | Build Pipeline, Dispatchr | `form_sessions`, `form-uploads` |
| **External Webhooks & Callbacks** | inbound submit webhook, Slack/email/Telegram intake, SL callbacks | AI Wizard, Build Pipeline | `inbound_proposals`, `build_jobs`, `rate_limit_entries` |
| **Auth & Sessions** | admin (Supabase email allowlist), client PIN, sales-rep PIN | all gated surfaces | `clients`, `sales_reps`, `pin_login_attempts` |
| **Admin Dashboard** | tasks, clients, reps, submissions, builds, billing, settings | every subsystem | `tasks`, `task_*`, `invoices`, `notification_settings`, `audit_log` |
| **Client Portal** | client view of own tasks + comments | Auth, Tasks | `tasks`, `task_comments` |
| **Sales-Rep Portal** | rep task view, outcomes, prospect conversion, scrape submit | Template GTM, Tasks | `tasks`, `tpl_prospects`, `tpl_sales_activity` |
| **Website Build Pipeline** | dispatch builds, status, resubmit, cost capture | SiteLaunchr (C1/C4), Dispatchr, Billing | `build_jobs` |
| **AI Wizard & Notifications** | task estimation, inbound→proposal, Telegram approval, Resend emails | Admin, Tasks, Anthropic, Telegram, Resend | `inbound_proposals`, `telegram_conversations`, `ai_velocity_log`, `notification_settings` |
| **Template Site GTM** (`tpl_*`) | campaigns, prospects, enrich, qualify, push, mail, scans, calls | SiteLaunchr (C2/C3/C4), Apify, Firecrawl, Lob, Click2Mail | `tpl_*` (14 tables) |
| **Industry References** | reference sites/aliases per industry, "Other" mapping | AI/sales-form context | `industry_references`, `industry_aliases`, `industry_other_log` |
| **Billing** | per-build cost, 2.5× markup, invoices | Build Pipeline, Admin | `build_jobs.cost_usd`, `invoices` |

## Shared services
- **SiteLaunchr** is shared by both spines via separate source identities: `wr` (onboarding) and `wr-template` (GTM). Distinct credentials, same HMAC scheme.
- **Dispatchr** observes both spines (one event vocabulary).
- **Trigger.dev** runs all heavy/async work for both spines.
- **Notifications** (Resend + Telegram) serve onboarding, tasks, and abandonment.

## Where the boundaries are
- **Trust boundary:** public token-scoped routes (form/build/export-by-token, QR `/r/[token]`) vs. authenticated admin/portal/rep routes vs. signature-verified partner callbacks. See [boundaries](./architecture/boundaries.md).
- **Ownership boundary:** everything `tpl_*` is the GTM machine; everything else is the agency-ops core. They meet at SiteLaunchr and at the sales-rep role.

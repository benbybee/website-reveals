# Admin Dashboard Design

## Overview

A password-protected admin dashboard for viewing submitted form sessions and exporting markdown briefs for the Claude Code website-building agent.

## Auth

- **Provider:** Supabase Auth with email/password
- **Access control:** `ADMIN_EMAILS` env var (comma-separated allowlist)
- **Session management:** `@supabase/ssr` for cookie-based auth
- **Route protection:** `middleware.ts` redirects unauthenticated users on `/admin/*` to `/admin/login`

## Pages

### `/admin/login`

Email + password form. On submit, calls `supabase.auth.signInWithPassword()`. If the email is not in `ADMIN_EMAILS`, sign out immediately and show error. Redirect to `/admin` on success.

### `/admin`

Server component fetches all `form_sessions` where `submitted_at IS NOT NULL`, ordered by `submitted_at DESC`.

## Submissions Table

- **Columns:** Business Name, Source (`_source` tag), Email, Submitted date
- **Sorting:** Click column headers to sort ascending/descending
- **Filtering:**
  - Text search (filters business name and email)
  - Source dropdown (All / novalux / new-client / claim-your-site)
  - Date range picker (from/to)
- **Row click:** Opens detail drawer

## Detail Drawer

Slide-out panel from the right showing full form data organized by section:

- Business Details (name, contact, address)
- Contact Info (email, phone)
- Service Area
- Domain & DNS (domain, provider)
- Additional Details
- Questionnaire answers (if from the multi-step form)

### Export Actions

- **Copy Markdown** button — copies formatted brief to clipboard
- **Download .md** button — downloads as `{business_name}-brief.md`

## Markdown Export Format

```markdown
# {Business Name} — Website Brief

**Source:** {source} | **Submitted:** {date}

## Business Details
- **Business Name:** ...
- **Contact:** ...
- **Email:** ...
- **Phone:** ...
- **Address:** ...

## Service Area
- ...

## Domain & DNS
- **Domain:** ...
- **DNS Provider:** ...

## Additional Details
...

## Questionnaire Responses
(if applicable, each question label + answer)
```

## New Files

| File | Purpose |
|------|---------|
| `middleware.ts` | Route protection for `/admin/*` |
| `lib/supabase/middleware.ts` | Supabase SSR cookie refresh helper |
| `app/admin/login/page.tsx` | Login page |
| `app/admin/page.tsx` | Dashboard server component |
| `components/admin/SubmissionsTable.tsx` | Client component: table + filters |
| `components/admin/DetailDrawer.tsx` | Client component: slide-out detail view |
| `lib/export-markdown.ts` | Generates markdown string from form_data |

## New Dependency

- `@supabase/ssr` — cookie-based auth for Next.js

## Env Vars

- `ADMIN_EMAILS` — comma-separated list of allowed admin emails
- Existing `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` reused

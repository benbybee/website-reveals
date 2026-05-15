# External Webhook Integration Design

**Date:** 2026-03-08
**Status:** Approved

## Problem

Forms on external websites (owned by us) need to trigger the automated website build flow in Website Reveals and appear in the admin dashboard. Currently, all submissions flow through the app's own form pages with no inbound webhook endpoint.

## Decisions

- **Form types supported:** quick, standard, in-depth (not novalux or new-client)
- **Auto-trigger builds:** Yes — payment happens on the external site before data is sent here
- **Security:** API key in `x-api-key` header + origin allowlist + rate limiting
- **Admin integration:** External submissions appear alongside native ones, filterable by `_source = "external"`

## Architecture

### New Webhook Endpoint

`POST /api/webhooks/submit`

**Request:**
```
Headers:
  x-api-key: <WEBHOOK_API_KEY>
  Content-Type: application/json
  Origin: https://obsessionmarketing.com

Body:
{
  "form_type": "quick | standard | in-depth",
  "form_data": {
    "business_name": "Acme Plumbing",
    "contact_email": "owner@acme.com",
    ...field IDs from the relevant form type
  }
}
```

**Responses:**
- `200 { ok: true, token: "uuid" }` — success, build queued
- `400 { error: "...", fields: [...] }` — validation failure
- `401 { error: "Unauthorized" }` — bad/missing API key
- `403 { error: "Forbidden" }` — origin not allowed
- `429 { error: "Rate limit exceeded" }` — too many requests

### Endpoint Logic (in order)

1. Validate API key from `x-api-key` header against `WEBHOOK_API_KEY` env var
2. Validate `Origin` header against `WEBHOOK_ALLOWED_ORIGINS` env var
3. Rate limit by IP (in-memory, max N per hour per IP)
4. Validate payload: `form_type` must be `quick | standard | in-depth`, required fields checked
5. Create `form_sessions` row with `submitted_at` already set, `form_data._source = "external"`, `form_data._mode = <form_type>`
6. Insert `build_jobs` row
7. Trigger Trigger.dev `build-website` task (same as existing submit route)
8. Send notification emails (same as existing submit route)
9. Return `{ ok: true, token }`

### Security Layer (`lib/webhook-auth.ts`)

- **API key validation:** Compare `x-api-key` header to `WEBHOOK_API_KEY` env var using timing-safe comparison
- **Origin check:** Match `Origin` header against comma-separated `WEBHOOK_ALLOWED_ORIGINS`
- **Rate limiter:** In-memory Map keyed by IP, sliding window of 1 hour, configurable via `WEBHOOK_RATE_LIMIT` (default 10)

### Admin Dashboard Changes

- Add `"external"` as a source filter option in `SubmissionsTable.tsx`
- No other changes needed — external submissions create standard `form_sessions` rows

## Files

### New
- `app/api/webhooks/submit/route.ts` — webhook endpoint
- `lib/webhook-auth.ts` — API key, origin, rate limit utilities
- `docs/webhook-integration.md` — complete field reference for external site agent

### Modified
- `components/admin/SubmissionsTable.tsx` — add "external" source filter
- `.env.example` — add `WEBHOOK_API_KEY`, `WEBHOOK_ALLOWED_ORIGINS`, `WEBHOOK_RATE_LIMIT`

## Environment Variables

| Variable | Description | Example |
|---|---|---|
| `WEBHOOK_API_KEY` | 64-char hex secret for authenticating webhook requests | `a1b2c3...` |
| `WEBHOOK_ALLOWED_ORIGINS` | Comma-separated allowed Origin headers | `https://obsessionmarketing.com,https://www.obsessionmarketing.com` |
| `WEBHOOK_RATE_LIMIT` | Max submissions per IP per hour (default 10) | `10` |

## Field Reference per Form Type

### Quick (16 fields)

| Field ID | Label | Type | Required |
|---|---|---|---|
| `business_name` | What is your business name? | text | Yes |
| `contact_email` | Your email (so we can reach you) | email | Yes |
| `contact_phone` | Your phone number | tel | No |
| `phone` | Phone number for customers to call | tel | No |
| `email` | Email address for customers | email | No |
| `service_areas` | What cities or regions do you serve? | textarea | No |
| `contact_method` | How do you prefer customers to reach you? | checkbox (array) | No |
| `domain_owned` | Do you already own your domain name? | radio | No |
| `domain_name` | If yes, what is your domain name? | text | No |
| `dns_provider` | Who manages your domain/DNS? | text | No |
| `all_services` | What services or products do you offer? | textarea | No |
| `standard_pages` | What pages do you need? | checkbox (array) | No |
| `why_building` | Why are you building or redesigning your website right now? | textarea | No |
| `differentiators` | What makes your business different from competitors? | textarea | No |
| `inspiration_sites` | Any websites you love or want yours to look similar to? | textarea | No |
| `anything_else` | Anything else we should know? | textarea | No |

**Options for checkbox/radio fields:**
- `contact_method`: `["Phone call", "Text message", "Email", "Contact form"]`
- `domain_owned`: `["Yes", "No", "Not sure"]`
- `standard_pages`: `["Home", "About", "Services", "Individual service pages", "Contact", "FAQ", "Blog", "Gallery", "Testimonials", "Financing", "Careers", "Team", "Resources", "Privacy Policy", "Terms and Conditions"]`

### Standard (43 fields)

All Quick fields plus:

| Field ID | Label | Type | Required |
|---|---|---|---|
| `address` | Business address | text | No |
| `address_display` | Show address on website? | radio | No |
| `social_media` | Social media accounts to link | textarea | No |
| `top_goals` | What are the top 3 goals for this website? | textarea | No |
| `visitor_actions` | What actions do you want visitors to take? | textarea | No |
| `success_definition` | What would make this website a success? | textarea | No |
| `customer_type` | Is this website mainly for: | radio | No |
| `ideal_customer` | Who is your ideal customer? | textarea | No |
| `customer_problems` | What problems are customers dealing with? | textarea | No |
| `motivation_to_reach_out` | What motivates them to finally reach out? | textarea | No |
| `what_they_care_about` | What do they care about most? | textarea | No |
| `objections` | Concerns or objections before buying? | textarea | No |
| `has_logo` | Do you have an existing logo? | radio | No |
| `logo_files` | Upload your logo files | file (skip) | No |
| `brand_colors` | What are your brand colors? | textarea | No |
| `look_and_feel` | Desired look and feel? | textarea | No |
| `brand_personality` | Brand personality words | textarea | No |
| `brand_feel` | Should the site feel more: | radio | No |
| `priority_services` | Highest priority services to promote? | textarea | No |
| `why_choose_you` | Why do customers choose you? | textarea | No |
| `trust_builders` | Guarantees, certifications, awards? | textarea | No |
| `inspiration_sites` | 2-3 websites you love | textarea | No |
| `testimonials` | Testimonials or reviews to feature? | textarea | No |
| `main_faqs` | Main FAQs for the site? | textarea | No |
| `specific_requests` | Specific concerns or must-haves? | textarea | No |

**Additional options:**
- `address_display`: `["Full address", "City/State only", "Don't show address"]`
- `customer_type`: `["New customers", "Returning customers", "Both"]`
- `has_logo`: `["Yes", "No", "In progress"]`
- `brand_feel`: `["Personal", "Corporate", "Local", "Premium", "Mix of several"]`

### In-depth (80+ fields)

All Standard fields plus the full 11-step questionnaire. See `lib/form-steps.ts` `FORM_STEPS` for the complete list. Key additional sections:

- **Step 5 — Competitive Positioning:** `differentiators`, `do_better`, `compliments`, `unique_offerings`, `selling_points`, `media_features`, `misconceptions`, `never_say`
- **Step 7 — Services & Offers:** `all_services`, `profitable_services`, `most_leads`, `seasonal_services`, `service_details`, `packages`, `downplay_services`, `financing`, `products`
- **Step 8 — Problems & Solutions:** `pre_find_problems`, `problem_impact`, `do_nothing`, `how_you_solve`, `results`, `fears`, `confidence_builders`, `pre_buy_questions`, `common_objections`, `overcome_objections`
- **Step 9 — Content Strategy:** `rewrite_content`, `existing_pages`, `specific_phrases`, `avoid_phrases`, `team_bios`, `company_story`, `mission_statement`, `want_blog`
- **Step 10 — Site Structure:** `needed_pages`, `standard_pages`, `want_blog_section`
- **Step 11 — Final Notes:** `anything_else`, `specific_requests`, `definitely_not`, `success_feeling`

## Notes

- File upload fields (`logo_files`, `brand_guidelines`, `brand_photos`) are skipped for the webhook — external sites should provide URLs to hosted files in a textarea field instead
- `dns_provider` is sent as a plain string (not the dns-selector widget) — accepted values match the provider IDs in the app
- `checkbox` type fields must be sent as JSON arrays of strings
- `radio` type fields are sent as a single string matching one of the defined options

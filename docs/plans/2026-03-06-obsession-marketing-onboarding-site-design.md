# Obsession Marketing — Website Onboarding Site Design

**Date:** 2026-03-06
**Project:** Website Onboarding Portal for Obsession Marketing clients
**Status:** Approved

---

## Overview

A premium dark-themed Next.js website that markets Obsession Marketing's web development service and captures client onboarding data via a 12-step questionnaire. Clients fill out the form, can save progress via an emailed resume link (no login required), and receive tailored DNS setup instructions on completion.

---

## Tech Stack

- **Framework:** Next.js 15 (App Router)
- **Hosting:** Vercel
- **Database:** Supabase (Postgres) — form sessions, submissions
- **Storage:** Supabase Storage — file uploads (logos, photos, brand assets)
- **Email:** Resend — save/resume links, submission confirmations, DNS instructions
- **Styling:** Tailwind CSS + Framer Motion (animations)
- **Fonts:** Syne (headlines), Inter (body), JetBrains Mono (labels/accents)

---

## Site Routes

| Route | Purpose |
|---|---|
| `/` | Marketing landing page |
| `/start` | Begin questionnaire (creates new session) |
| `/q/[token]` | Resume saved questionnaire session |
| `/api/form/start` | POST — create session |
| `/api/form/[token]` | GET — load session, PUT — auto-save |
| `/api/form/[token]/save-email` | POST — store email, send resume link |
| `/api/form/[token]/submit` | POST — finalize, send emails |

---

## Visual Identity

**Color Palette:**
- Background base: `#0a0a0f` (dark obsidian)
- Primary accent: electric blue `#3b82f6` → cyan `#06b6d4` (gradient)
- Secondary accent: neon violet `#8b5cf6`
- CTA accent: lime green `#84cc16`
- Text primary: `#f8fafc`
- Text muted: `#94a3b8`
- Border subtle: `rgba(255,255,255,0.08)`

**Typography:**
- Headlines: `Syne` (Google Fonts, bold, geometric)
- Body: `Inter`
- Labels/step numbers: `JetBrains Mono`

**Motion Language:**
- Background: animated mesh gradient + floating orb particles
- Cards: glow bloom on hover (box-shadow)
- Sections: scroll-triggered fade + slide-up (Framer Motion)
- Form steps: slide transition left/right
- CTA button: pulsing glow ring animation

---

## Landing Page Sections

### 1. Hero
- Full-viewport dark background with animated mesh + floating orbs
- Headline: "Your Website Should Work as Hard as You Do"
- Subheadline: value prop for Obsession Marketing web dev
- Primary CTA: "Start Your Project →" (glowing button, links to `/start`)
- Secondary CTA: "See Our Work" (scroll anchor to portfolio)
- Animated agency badge

### 2. Portfolio Showcase
- Title: "Sites We've Built"
- Grid of browser-chrome mockup cards (screenshots of 7 client sites)
- Sites to screenshot:
  - https://wordpress-1595966-6262657.cloudwaysapps.com/
  - https://wordpress-1595966-6260284.cloudwaysapps.com/
  - https://wordpress-1595966-6257070.cloudwaysapps.com/
  - https://true-beef.com/
  - https://wordpress-1595966-6256024.cloudwaysapps.com/
  - https://novalux2.websitereveals.com/
  - https://clubhousecards.net/
- Card hover: 3D tilt + glow border + "View Live →" overlay

### 3. Process
- Steps: Discovery → Design → Build → Launch
- Icon per step, short description
- Animated connecting line

### 4. Trust / Social Proof
- Testimonials or stats (sites built, years, US-based)
- Animated counters

### 5. Final CTA
- Glow-bordered card
- "Start Your Questionnaire →" button
- Reassurance: "Takes ~20 min · Save anytime · No account required"

---

## Questionnaire — 12 Steps

Pages `/start` and `/q/[token]` share the same full-page form UI:
- Top bar: logo + animated progress bar + step counter
- Centered card (max 680px) with glow border
- Back / Continue buttons
- "Save & Continue Later" persistent button (bottom-left)

### Step List
1. Tell Us About Your Business (Business Basics) — includes DNS provider selector
2. What Should This Website Do? (Goals)
3. Who Are You Trying to Reach? (Audience)
4. Your Brand Look and Feel (Brand Identity) — includes file uploads
5. What Makes You Different? (Competitive Positioning)
6. Existing Website + Sites You Love (Inspiration)
7. What You Sell and How You Explain It (Services)
8. What Your Customers Struggle With (Problems/Solutions)
9. Content, Messaging, and FAQs
10. Photos, Videos, and Visual Assets — file uploads
11. Pages and Navigation (Site Structure)
12. Anything Else We Should Know? (Final Notes)

### DNS Provider Selector (Step 1)
Radio card UI with provider logo + descriptor:
1. GoDaddy — "Most common for small businesses"
2. Namecheap — "Popular developer choice"
3. Cloudflare — "Best performance & security"
4. Google Domains / Squarespace DNS — "Simple, clean interface"
5. Network Solutions — "Legacy provider"
6. Other — free text input

Selected state: glowing accent border.

---

## Save & Resume Flow

1. Client clicks "Save & Continue Later" on any step
2. Modal prompts for email address
3. API creates/updates session with email, fires Resend email with magic link
4. Link format: `domain.com/q/[uuid-token]`
5. Token expires after 30 days
6. localStorage auto-saves progress as fallback (same device/browser)
7. Expired token → friendly message + option to restart

---

## Form Completion Flow

On Step 12 submit:
1. Session marked `submitted_at = now()`
2. **Email to client:** confirmation receipt + DNS setup instructions (provider-specific HTML template) + A record IP address
3. **Email to agency:** full submission summary with all form data + file links
4. **Success screen:** confetti animation + "We'll be in touch within 1 business day"

---

## Data Model

### `form_sessions` (Supabase)
```sql
id          uuid PRIMARY KEY DEFAULT gen_random_uuid()
token       uuid UNIQUE NOT NULL DEFAULT gen_random_uuid()
email       text
current_step int DEFAULT 1
form_data   jsonb DEFAULT '{}'
file_urls   jsonb DEFAULT '[]'
dns_provider text
submitted_at timestamp
expires_at  timestamp NOT NULL DEFAULT now() + interval '30 days'
created_at  timestamp NOT NULL DEFAULT now()
```

---

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
RESEND_API_KEY
AGENCY_EMAIL
AGENCY_IP_ADDRESS
NEXT_PUBLIC_BASE_URL
```

---

## Email Templates (Resend)

1. **Resume Link Email** — subject: "Continue Your Website Questionnaire", magic link button, expires note
2. **DNS Instructions Email** — subject: "Next Step: Point Your Domain — [Business Name]", provider-specific numbered steps, A record IP, access grant instructions
3. **Submission Confirmation (client)** — receipt + what happens next
4. **Submission Summary (agency)** — all form data formatted, file links, DNS provider noted

# Template "Find Your Site" — single-QR lookup + engagement tracking

**Date:** 2026-06-15
**Status:** Approved (design) → implementation plan next
**Module:** Template Site pipeline (`tpl_` namespace), gated by `TEMPLATES_ENABLED`

## Problem

The Template Site postcard campaign mails ~1,000 businesses a card showing that
we've already built them a speculative website. The recipient needs a way to get
to *their* preview.

The existing mechanism ([036_tpl_qr_scans.sql](../../supabase/migrations/036_tpl_qr_scans.sql))
mints a **unique** `qr_token` per mailing and prints a per-card QR pointing at
`/r/<token>`. That requires 1,000 distinct QR images — not feasible for the print
run.

**Goal:** one static QR on every card → a public page where the owner types their
**business name + ZIP** → resolves to their Cloudflare `*.pages.dev` preview →
"Open your site →". And, since a shared QR can't identify the business, **replace
QR-scan tracking with per-prospect looked-up / clicked tracking** fed back to the
sales board.

## Non-goals / explicitly out of scope

- **No privacy gate.** Preview sites are already public (`*.pages.dev`), contain
  only the business's own public Google-listing data, and exist to be shown. The
  lookup is a directory, not a secret store. Name+ZIP is for **disambiguation**
  (name collisions), not access control. No anti-enumeration messaging, no signed
  click tokens.
- **No removal of the old `/r/` + `tpl_qr_scans` system.** It stays intact and
  untouched; we add the single-QR path alongside it.
- **No lead capture / email gate** before revealing the link (owner-confirmed
  "minimal link only").
- **No "mailed-only" restriction.** Eligibility is simply "has a `preview_url`."

## Data model (one additive migration)

All changes are additive and idempotent (`IF NOT EXISTS`) — a build-on, never a
tear-down. `record` JSONB stays the SL-callback write target; the new columns are
a queryable, indexed mirror.

Promote from `record` JSONB → columns on `tpl_prospects`:

| Column | Backfill source | Purpose |
|---|---|---|
| `preview_url text` | `record->>'preview_url'` | the Cloudflare preview link |
| `sl_build_id text` | `record->>'sl_build_id'` | SL build id, first-class |
| `zip text` | `record->'address'->>'zip'` | exact disambiguation key in the resolve hot path |

Matching support:
- `CREATE EXTENSION IF NOT EXISTS pg_trgm;`
- GIN trigram index on `business_name` (forgiving fuzzy match; instant at ~1k rows).
- btree index on `zip`.

Engagement rollups on `tpl_prospects` (the new board signal, mirrors the existing
scan rollups on `tpl_mailings`):
- `lookup_count int NOT NULL DEFAULT 0`, `last_looked_up_at timestamptz`
- `click_count int NOT NULL DEFAULT 0`, `last_clicked_at timestamptz`

Append-only event log (same shape as `tpl_qr_scans`):

```
tpl_prospect_lookups (
  id          uuid pk,
  prospect_id uuid not null references tpl_prospects(id) on delete cascade,
  campaign_id uuid references tpl_campaigns(id) on delete set null,
  kind        text not null check (kind in ('resolved','clicked')),
  ip          text,
  user_agent  text,
  at          timestamptz not null default now()
)
```

Atomic recorder function `tpl_record_lookup(p_prospect_id, p_kind, p_ip, p_ua)` —
appends the event and bumps the matching rollup counter in one statement (no
read-modify-write race), mirroring `tpl_record_qr_scan`.

**SL callback change:** [sl-callback/route.ts](../../app/api/templates/sl-callback/route.ts)
writes `preview_url`/`sl_build_id` to **both** the new columns and `record` JSONB,
so every existing reader keeps working and the columns stay current.

## Public lookup flow

- **`/join`** — public page (the single QR's destination; path confirmed free).
  `force-dynamic`, gated by `templatesEnabled()` (404 when off). One form:
  business name + ZIP.
- **`POST /api/templates/find`** — resolve. Trigram match on `business_name`
  AND exact `zip`, scoped to `preview_url IS NOT NULL`. Returns:
  - one match → `{ id, business_name, city, state }` + records a `resolved` event,
  - several (same name+zip) → a short picker list (name + city),
  - none → plain "couldn't find it — check the spelling or the ZIP on your card."
  - Light per-IP rate limit (standard hygiene for a public DB-touching endpoint).
- **`/s/<prospect_id>`** — tracked redirect. Records a `clicked` event, then 302s
  to `preview_url`. Server-side so it works even with JS disabled. `prospect_id`
  is the UUID (not enumerable enough to matter).

**Result UI ("minimal link only"):** business name + a single **"Open your site →"**
button → `/s/<prospect_id>`. Nothing else.

## Tracking → sales board

- The resolve endpoint logs `resolved`; the `/s/` redirect logs `clicked`.
- Funnel per business: **mailed → looked up → clicked through.**
- [app/admin/templates/sales/page.tsx](../../app/admin/templates/sales/page.tsx)
  selects the new rollups; [SalesBoard.tsx](../../components/admin/templates/SalesBoard.tsx)
  swaps the "scanned" column for **"Looked up / Clicked"** (count + last time).

## Postcard change

The `{{qr_url}}` merge var switches from the per-card `/r/<token>` to the single
static `/join` URL — same QR on every card. (Old per-card path remains available.)

## Testing

- Resolver: fuzzy+zip single/multi/no-match; ZIP mismatch returns no match;
  `preview_url IS NULL` excluded.
- `tpl_record_lookup`: increments correct counter, appends one event, no race.
- Backfill: columns equal their JSONB source for existing rows.
- Gating: `/join`, `/api/templates/find`, `/s/` all 404 when `TEMPLATES_ENABLED` off.

## Rollout

1. Apply migration (additive + backfill) to prod Supabase.
2. Deploy app (Vercel).
3. Point the postcard template's QR at `/join`; print run uses one QR image.

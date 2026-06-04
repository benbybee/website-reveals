# Go-to-Market Layer — Postcards (Lob) + CSV Export — Scoping Note

- **Date:** 2026-06-03
- **Owner:** WR
- **Status:** SCOPING (no code yet — decisions needed from Ben where flagged `@OPERATOR`)
- **Scope:** Step 5 of the template pipeline — getting a previewed lead a postcard with
  their site URL, plus an ad-hoc CSV export of the lead list. This is WR-internal product
  work; it is **not** part of the 4-way `PIPELINE-COORDINATION.md` SL seam.

---

## 1. Where this sits in the pipeline

```
scrape → enrich → qualify → push to SL → SL builds + deploys to *.pages.dev
   → callback flips prospect to `live` (preview-ready, preview_url stored)
        → [THIS DOC] postcard mailed with the preview URL
             → owner sees site → rep closes on a CALL → mark `converted`
                  → (O3) conversion webhook → Kura push
```

The postcard fires **after** a prospect reaches the preview-ready state and
`record.preview_url` (the `*.pages.dev` URL) is populated by the SL callback.

Operator decisions already locked (from session 2026-06-03):
- **Domain on the card = temporary.** The `*.pages.dev` URL is fine; no custom domain
  is registered at Stage 1. Card copy doesn't need a vanity domain.
- **Conversion is a phone call**, rep-driven — the card drives the owner to *view* the
  site (and likely a call-to-action phone number), not a self-serve signup page.
- **Lob** is the mail vendor.
- A **CSV export** with selectable fields is also wanted (vendor-agnostic / manual use).

---

## 2. Data we already have (no new scraping needed)

`tpl_prospects.record` (`CanonicalRecord`, see `lib/templates/types.ts`) already carries
everything a mailer needs:

| Need | Field |
|---|---|
| Mailing address | `address.{street, city, state(2-letter), zip, country}` — **structured**, Lob-ready |
| Business name | `business_name` (`legal_name` optional) |
| Preview URL | `record.preview_url` (set by `sl-callback` on `succeeded → live`) |
| Phone (CTA) | `phone` |
| Dedup key | `source_id` |
| Filtering | promoted columns: `business_name, city, state, phone, website_status, stage, agent_id` |

Gap: **address deliverability is unverified.** Apify/Places addresses are usually good
but not guaranteed mailable. Lob's US address-verification API should gate sends.

---

## 3. Recommended approach — two phases (foundation first)

### Phase A — CSV export (small, ship first)
A vendor-agnostic export unblocks manual mailing **today** and is a permanent ops tool.

- **UI:** an "Export CSV" action on the campaign prospect list (admin/sales board).
- **Field selection at export time:** a checkbox list of exportable fields
  (business_name, full address split into columns, phone, email, website, website_status,
  stage, agent, preview_url, source_id, confidence). User picks the subset → CSV columns.
- **Filtering:** export respects the current list filters (stage, city/state, agent,
  website_status) so you can export e.g. "all `live` prospects in TX assigned to Jane."
- **Endpoint:** `GET /api/templates/campaigns/[id]/export?fields=...&<filters>` →
  streamed `text/csv`. Admin-auth gated (same `requireAdmin` as the rest of the surface).
- **Effort:** ~half a day. No external dependency.

### Phase B — Lob postcard automation (the real subsystem)
Automated, idempotent, address-verified direct mail.

**B1. Mail log + idempotency (foundation — build this first).**
New table `tpl_mailings` (one row per prospect per mail attempt): `prospect_id`,
`campaign_id`, `lob_id`, `status` (`queued|verified|undeliverable|sent|failed|suppressed`),
`address_snapshot`, `preview_url_snapshot`, `cost_usd`, `created_at`, `sent_at`. A unique
constraint on `(prospect_id)` (or `(prospect_id, campaign_id)`) prevents double-mailing on
re-runs. **This is the durable backbone — without it, a re-run mails everyone twice.**

**B2. Address verification.** Before creating a postcard, run Lob US Verification on the
prospect address. `deliverable` → proceed; `undeliverable`/`deliverable_missing_unit` →
mark `undeliverable`, skip, surface in UI for manual fix. Cache the verified address on
the mailing row.

**B3. Postcard creation.** Lob `POST /v1/postcards` with a designed front/back template
(HTML or PDF with merge variables): business name, a friendly line, the preview URL, and a
**QR code → preview_url** (so the owner scans → sees their site). Size: 6x4 or 6x9.
Merge `to` address from the verified record; `from` = WR return address.

**B4. QR + scan attribution (recommended).** Point the QR at a short, **per-lead tracked**
URL (e.g. `wr.link/p/<source_id>` → 302 to `preview_url`) so scans are logged → "who looked
at their site" feeds the rep's call list. Without this the QR still works, just no tracking.

**B5. Trigger + batching.** A Trigger.dev task `tpl-mail-campaign` (mirrors the existing
discover/enrich pattern) that: loads eligible prospects (stage = `live`, has `preview_url`,
not already in `tpl_mailings`, not `do_not_mail`), verifies + creates postcards in batches,
writes `tpl_mailings` rows. Operator kicks it off per campaign from the UI (an explicit
"Mail this campaign" action with a count + estimated cost confirmation).

**B6. Suppression list.** Honor a `do_not_mail` flag (and skip `converted`/`dead`).
Operator can mark prospects to exclude before a send.

---

## 4. Cost — `@OPERATOR` should eyeball this

Lob postcards run ~$0.50–$1.50 each depending on size/volume; address verification is a
few cents. At **3,500 leads that's roughly $1,750–$5,250 per campaign** (plus verification).
This is the single largest variable cost in the pipeline — far more than the cents-per-site
LLM fill. Worth a per-campaign spend confirmation gate in the UI before a mass send (the
"Mail this campaign" action shows count × unit cost and requires confirm).

---

## 5. Open questions for Ben (`@OPERATOR`)

1. **Eligibility gate:** mail every `live` prospect automatically, or only after a rep/agent
   marks a prospect "ready to mail"? (Recommend a manual per-campaign trigger with a cost
   confirm — avoids accidentally mailing 3,500 cards.)
2. **Postcard design:** do you have a front/back design, or should we draft one? Lob needs
   an HTML/PDF template with merge fields.
3. **QR tracking:** build the per-lead tracked short-URL (scan attribution) in v1, or just
   QR straight to `preview_url` and add tracking later?
4. **Return address + sender identity** for the `from` field (WR business address).
5. **Re-mail policy:** if a prospect's preview is rebuilt, do we ever mail a second card, or
   strictly one card per prospect ever?
6. **CSV first, or both at once?** Recommend shipping Phase A (CSV) immediately and doing
   Phase B (Lob) as the larger follow-on.

---

## 6. Non-goals (explicitly out of scope here)

- Custom domain registration per lead (Stage 1 uses the temporary `*.pages.dev` URL).
- A self-serve signup/claim web page (conversion is a phone call, rep-driven, per O3).
- Anything in `PIPELINE-COORDINATION.md` (SL/BUILDER/KURA seams) — this doc is WR-only.

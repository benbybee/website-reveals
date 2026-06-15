# L7 — Notification Loop

**Goal:** Tell the right audience when something happens — task status changes, build review-ready, submission abandoned — and attribute QR scans back to mailings.

**Executor:**
- Email: `lib/task-emails.ts` (Resend) — `sendStatusChangeEmail`, `sendReviewNotificationEmail`, `sendSalesRepCompletionEmail`, abandonment emails (`cron/notify-abandoned-submissions`).
- Telegram: status/review alerts to the admin chat.
- Attribution: `app/r/[token]` → `tpl_record_qr_scan()` logs a scan and redirects to the preview URL.

**Evaluator (L1):** the audience gate — `isNotificationEnabled(audience)` against `notification_settings`; audience derived from the form session source / `audienceForClientId()`. QR scan: no evaluator (pure append-and-redirect attribution).

**Retry:** none — notification sends are best-effort; errors are suppressed and the endpoint returns 200 (G-NOTIF1).

**Escalation / gate:** none. The audience toggle is the only gate.

**Approval gate:** n/a.

**Observability:** `notification_settings` (audience, enabled); `tpl_qr_scans` (append-only) + denormalized `tpl_mailings.scan_count`/timestamps for the funnel (mailed → scanned).

**Runtime states:** n/a (fire-and-forget); QR scan is an append-only event.

**Gaps:**
- **G-NOTIF1 (Low):** all errors suppressed → a failed client email is invisible.
- `audienceForClientId()` falls back to `client` silently if the form session is gone (can drop the sales-rep audience).
- `tpl_qr_scans` has no archival/TTL (G-HOUSE1); double-scans increment the counter (no replay protection).

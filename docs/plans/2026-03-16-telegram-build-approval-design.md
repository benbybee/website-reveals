# Telegram Build Approval Flow

**Date:** 2026-03-16
**Status:** Approved

## Problem

When a website build completes, the admin gets an email but has no way to approve it via Telegram. The task must be manually marked complete in the admin panel to trigger the client notification email. Builds have also been silently stalling without notifications (fixed separately).

## Design

Three targeted changes to existing code — no new endpoints or tables.

### 1. Build-complete Telegram notification includes task context

**File:** `src/trigger/build-website.ts`

The success path already sends an email to the admin. Add a Telegram notification alongside it that includes the task ID and site URL, so the AI agent can reference it later.

### 2. AI system prompt includes builds awaiting review

**File:** `app/api/integrations/telegram/webhook/route.ts`

Add a Supabase query for `build_jobs` with `status = 'deployed'` joined to their linked tasks (still `in_progress`). Include these in the AI system prompt so when the admin says "looks good" or "approve the Acme build", the AI knows which task to complete.

### 3. Task completion via Telegram triggers client email

**Files:** `app/api/integrations/telegram/webhook/route.ts`

In the `update_task` handler, when `status === "complete"`, fetch the client and call `sendStatusChangeEmail()` — the same function the admin panel's status route uses. This ensures the client gets their "site is live" email regardless of whether completion happens via admin panel or Telegram.

## Flow

```
Build deploys
  → Telegram notification with task ID + site URL
  → Admin reviews site
  → Admin replies in Telegram ("looks good", "approve it", etc.)
  → AI agent marks task complete
  → sendStatusChangeEmail() notifies client
```

# External Webhook Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow forms on external websites to trigger the automated website build flow via a secured webhook endpoint, with submissions appearing in the admin dashboard.

**Architecture:** New `POST /api/webhooks/submit` endpoint secured by API key + origin allowlist + rate limiting. Reuses existing `resolveFormType()`, `buildPrompt()`, Trigger.dev task, and email notifications. External submissions are tagged with `_source: "external"` and appear in the admin dashboard with a new filter option.

**Tech Stack:** Next.js API routes, Supabase, Trigger.dev, Resend (all existing)

---

### Task 1: Create webhook auth utilities

**Files:**
- Create: `lib/webhook-auth.ts`

**Step 1: Create `lib/webhook-auth.ts`**

This file exports three functions: `validateApiKey`, `validateOrigin`, and `checkRateLimit`.

```typescript
import { timingSafeEqual } from "crypto";

/**
 * Validate the x-api-key header against the WEBHOOK_API_KEY env var.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export function validateApiKey(headerValue: string | null): boolean {
  const expected = process.env.WEBHOOK_API_KEY;
  if (!expected || !headerValue) return false;
  if (expected.length !== headerValue.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(headerValue));
}

/**
 * Check if the request Origin header is in the WEBHOOK_ALLOWED_ORIGINS list.
 * Returns true if no origins are configured (disabled).
 */
export function validateOrigin(origin: string | null): boolean {
  const allowed = process.env.WEBHOOK_ALLOWED_ORIGINS;
  if (!allowed) return true; // origin check disabled if not configured
  if (!origin) return false;
  const origins = allowed.split(",").map((o) => o.trim().toLowerCase());
  return origins.includes(origin.toLowerCase());
}

/**
 * Simple in-memory sliding-window rate limiter keyed by IP.
 * Returns true if the request is allowed, false if rate limited.
 */
const windows = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(ip: string): boolean {
  const limit = parseInt(process.env.WEBHOOK_RATE_LIMIT || "10", 10);
  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 1 hour

  const entry = windows.get(ip);
  if (!entry || now > entry.resetAt) {
    windows.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors related to `lib/webhook-auth.ts`

**Step 3: Commit**

```bash
git add lib/webhook-auth.ts
git commit -m "feat: add webhook auth utilities (API key, origin check, rate limiter)"
```

---

### Task 2: Create the webhook submit endpoint

**Files:**
- Create: `app/api/webhooks/submit/route.ts`
- Reference: `app/api/form/[token]/submit/route.ts` (existing submit route to mirror)

**Step 1: Create `app/api/webhooks/submit/route.ts`**

This is the core endpoint. It mirrors the logic from the existing submit route but accepts external JSON payloads instead of operating on an existing session.

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { Resend } from "resend";
import { getDnsInstructions } from "@/lib/dns-instructions";
import { tasks } from "@trigger.dev/sdk/v3";
import { buildPrompt } from "@/lib/prompts";
import { validateApiKey, validateOrigin, checkRateLimit } from "@/lib/webhook-auth";
import type { FormType } from "@/lib/resolve-form-type";

const ALLOWED_FORM_TYPES: FormType[] = ["quick", "standard", "in-depth"];

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

export async function POST(req: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────
  const apiKey = req.headers.get("x-api-key");
  if (!validateApiKey(apiKey)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const origin = req.headers.get("origin");
  if (!validateOrigin(origin)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  // ── Parse & validate payload ────────────────────────────────
  let body: { form_type?: string; form_data?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { form_type, form_data } = body;

  if (!form_type || !ALLOWED_FORM_TYPES.includes(form_type as FormType)) {
    return NextResponse.json(
      { error: `form_type must be one of: ${ALLOWED_FORM_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  if (!form_data || typeof form_data !== "object") {
    return NextResponse.json({ error: "form_data is required" }, { status: 400 });
  }

  // Required fields
  const missing: string[] = [];
  if (!form_data.business_name) missing.push("business_name");
  if (!form_data.contact_email) missing.push("contact_email");
  if (missing.length > 0) {
    return NextResponse.json(
      { error: "Missing required fields", fields: missing },
      { status: 400 }
    );
  }

  const formType = form_type as FormType;

  // Tag as external submission
  const taggedFormData = {
    ...form_data,
    _source: "external",
    _mode: formType,
  };

  const supabase = createServerClient();

  // ── Create form session ─────────────────────────────────────
  const { data: session, error: insertErr } = await supabase
    .from("form_sessions")
    .insert({
      form_data: taggedFormData,
      email: form_data.contact_email as string,
      dns_provider: (form_data.dns_provider as string) || null,
      current_step: 999, // completed
      submitted_at: new Date().toISOString(),
    })
    .select("token")
    .single();

  if (insertErr || !session) {
    console.error("[webhook] Failed to create session:", insertErr?.message);
    return NextResponse.json({ error: "Failed to create submission" }, { status: 500 });
  }

  const token = session.token;
  const businessName = (form_data.business_name as string) || "Your Business";
  const resend = getResend();

  // ── Send emails (same as existing submit route) ─────────────
  // DNS instructions to client
  const clientEmail = form_data.contact_email as string;
  const dnsProvider = (form_data.dns_provider as string) || "other";
  const ipAddress = process.env.AGENCY_IP_ADDRESS || "TBD";

  try {
    const dnsHtml = getDnsInstructions(dnsProvider, ipAddress, businessName);
    await resend.emails.send({
      from: "Website Reveals <creativemarketing@websitereveals.com>",
      to: clientEmail,
      subject: `Next Step: Point Your Domain — ${businessName}`,
      html: dnsHtml,
    });
  } catch (emailErr) {
    console.error("[webhook] DNS email failed:", emailErr);
  }

  // Agency notification
  if (process.env.AGENCY_EMAIL) {
    try {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_BASE_URL || "https://obsession-marketing-onboarding.vercel.app";
      await resend.emails.send({
        from: "Website Reveals <creativemarketing@websitereveals.com>",
        to: process.env.AGENCY_EMAIL,
        subject: `New External Submission — ${businessName}`,
        html: `<p>A new website build has been submitted via the external webhook.</p>
               <p><strong>${businessName}</strong><br>Form type: ${formType}<br>Contact: ${clientEmail}</p>
               <p><a href="${siteUrl}/api/export/${token}">Download export</a></p>`,
      });
    } catch (emailErr) {
      console.error("[webhook] Agency email failed:", emailErr);
    }
  }

  // Creative team notification
  try {
    await resend.emails.send({
      from: "Website Reveals <creativemarketing@websitereveals.com>",
      to: "creative@obsessionmarketing.com",
      subject: `Form Submitted — ${businessName}`,
      html: `<p>A new questionnaire has been submitted for <strong>${businessName}</strong>.</p>
             <p>Form type: ${formType}<br>Source: external webhook<br>Contact email: ${clientEmail}<br>Contact phone: ${(form_data.contact_phone as string) || "Not provided"}<br>Business email: ${(form_data.email as string) || "Not provided"}<br>Business phone: ${(form_data.phone as string) || "Not provided"}</p>`,
    });
  } catch (emailErr) {
    console.error("[webhook] Creative email failed:", emailErr);
  }

  // ── Queue automated website build ───────────────────────────
  try {
    console.log("[webhook] Starting build queue for token:", token);
    const fileUrls: string[] = [];
    const prompt = buildPrompt(formType, taggedFormData, fileUrls);

    const { data: buildJob, error: buildInsertErr } = await supabase
      .from("build_jobs")
      .insert({ token, form_type: formType })
      .select("id")
      .single();

    if (buildJob) {
      const triggerResult = await tasks.trigger("build-website", {
        buildJobId: buildJob.id,
        token,
        formType,
        prompt,
      });
      console.log("[webhook] Trigger result:", JSON.stringify(triggerResult));
    } else {
      console.error("[webhook] Build job insert failed:", buildInsertErr?.message);
    }
  } catch (buildErr) {
    console.error("[webhook] Failed to queue build job:", buildErr);
  }

  return NextResponse.json({ ok: true, token });
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add app/api/webhooks/submit/route.ts
git commit -m "feat: add external webhook submit endpoint"
```

---

### Task 3: Add "external" source filter to admin dashboard

**Files:**
- Modify: `components/admin/SubmissionsTable.tsx:12`

**Step 1: Update the SOURCES constant**

On line 12, change:
```typescript
const SOURCES = ["all", "claim-your-site", "novalux", "new-client"] as const;
```
to:
```typescript
const SOURCES = ["all", "claim-your-site", "novalux", "new-client", "external"] as const;
```

That's it. The existing source filter logic at line 43-46 already reads `form_data._source` and compares it to the selected filter value, so `"external"` will work automatically.

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add components/admin/SubmissionsTable.tsx
git commit -m "feat: add external source filter to admin dashboard"
```

---

### Task 4: Update .env.example

**Files:**
- Modify: `.env.example`

**Step 1: Add webhook env vars to .env.example**

Add these lines at the end of the file:

```
# External webhook (forms on other sites)
WEBHOOK_API_KEY=
WEBHOOK_ALLOWED_ORIGINS=
WEBHOOK_RATE_LIMIT=10
```

**Step 2: Commit**

```bash
git add .env.example
git commit -m "chore: add webhook env vars to .env.example"
```

---

### Task 5: Generate the API key and add to .env.local

**Step 1: Generate a 64-char hex API key**

Run: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

Copy the output.

**Step 2: Add to `.env.local`**

Add these lines (replace the key with the generated one):

```
WEBHOOK_API_KEY=<generated-key>
WEBHOOK_ALLOWED_ORIGINS=https://obsessionmarketing.com,https://www.obsessionmarketing.com
WEBHOOK_RATE_LIMIT=10
```

**Note:** Ask the user for the exact origin domains to allowlist. The above are placeholders.

**Step 3: Do NOT commit .env.local** — it's in .gitignore.

---

### Task 6: Create webhook integration reference doc

**Files:**
- Create: `docs/webhook-integration.md`

**Step 1: Create `docs/webhook-integration.md`**

This is the document your external site's Claude agent will read to know exactly what fields to collect and how to submit them. It should contain:

1. Endpoint URL, auth header, content type
2. Request/response format
3. Complete field reference per form type (quick, standard, in-depth) with field IDs, labels, types, required flags, and options for radio/checkbox fields
4. Example payloads for each form type
5. Error response formats

Pull all field definitions directly from `lib/form-steps.ts` — use `QUICK_STEPS` for quick, `STANDARD_STEPS` for standard, and `FORM_STEPS` for in-depth.

Include example curl commands for testing:

```bash
curl -X POST https://your-domain.com/api/webhooks/submit \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_KEY" \
  -d '{
    "form_type": "quick",
    "form_data": {
      "business_name": "Test Business",
      "contact_email": "test@example.com",
      "all_services": "Plumbing, HVAC",
      "service_areas": "Austin, TX"
    }
  }'
```

**Step 2: Commit**

```bash
git add docs/webhook-integration.md
git commit -m "docs: add webhook integration reference for external sites"
```

---

### Task 7: Manual end-to-end verification

**Step 1: Start the dev server**

Run: `npm run dev`

**Step 2: Test auth rejection (no key)**

Run:
```bash
curl -X POST http://localhost:3000/api/webhooks/submit \
  -H "Content-Type: application/json" \
  -d '{"form_type":"quick","form_data":{"business_name":"Test"}}'
```
Expected: `401 {"error":"Unauthorized"}`

**Step 3: Test auth rejection (wrong key)**

Run:
```bash
curl -X POST http://localhost:3000/api/webhooks/submit \
  -H "Content-Type: application/json" \
  -H "x-api-key: wrong-key" \
  -d '{"form_type":"quick","form_data":{"business_name":"Test"}}'
```
Expected: `401 {"error":"Unauthorized"}`

**Step 4: Test validation (missing required fields)**

Run:
```bash
curl -X POST http://localhost:3000/api/webhooks/submit \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_ACTUAL_KEY" \
  -d '{"form_type":"quick","form_data":{"business_name":"Test"}}'
```
Expected: `400 {"error":"Missing required fields","fields":["contact_email"]}`

**Step 5: Test successful submission**

Run:
```bash
curl -X POST http://localhost:3000/api/webhooks/submit \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_ACTUAL_KEY" \
  -d '{
    "form_type": "quick",
    "form_data": {
      "business_name": "Webhook Test Business",
      "contact_email": "test@example.com",
      "all_services": "Testing services",
      "service_areas": "Test City"
    }
  }'
```
Expected: `200 {"ok":true,"token":"<uuid>"}`

**Step 6: Verify in admin dashboard**

Navigate to `/admin` and confirm:
- The submission appears in the table
- Source shows "external"
- The "external" filter in the dropdown works
- Clicking the row opens the detail drawer with the submitted data

**Step 7: Final commit**

```bash
git add -A
git commit -m "feat: external webhook integration for cross-site form submissions"
```

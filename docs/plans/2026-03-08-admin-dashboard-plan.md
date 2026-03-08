# Admin Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a password-protected admin dashboard for viewing submitted forms and exporting markdown briefs.

**Architecture:** Supabase Auth with `@supabase/ssr` for cookie-based sessions. Next.js middleware protects `/admin/*` routes. Server component fetches submissions; client components handle table interaction and detail drawer.

**Tech Stack:** Next.js 16 App Router, Supabase Auth + SSR, React 19, TypeScript, inline styles (matching project conventions)

---

### Task 1: Install @supabase/ssr

**Files:**
- Modify: `package.json`

**Step 1: Install the dependency**

Run: `npm install @supabase/ssr`

**Step 2: Verify installation**

Run: `npx tsc --noEmit`
Expected: No new errors

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @supabase/ssr for cookie-based auth"
```

---

### Task 2: Create Supabase middleware helper

**Files:**
- Create: `lib/supabase/middleware.ts`

This helper creates a Supabase client that reads/writes cookies in the middleware context, refreshing the auth session on every request.

**Step 1: Create the middleware helper**

```typescript
// lib/supabase/middleware.ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAdminRoute =
    request.nextUrl.pathname.startsWith("/admin") &&
    !request.nextUrl.pathname.startsWith("/admin/login");

  if (isAdminRoute && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    return NextResponse.redirect(url);
  }

  // Check allowlist
  if (isAdminRoute && user) {
    const allowed = (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase());
    if (!allowed.includes(user.email?.toLowerCase() || "")) {
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = "/admin/login";
      url.searchParams.set("error", "unauthorized");
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
```

**Step 2: Verify types**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add lib/supabase/middleware.ts
git commit -m "feat: add Supabase SSR middleware helper for cookie-based auth"
```

---

### Task 3: Create root middleware

**Files:**
- Create: `middleware.ts` (project root, next to `app/`)

**Step 1: Create the middleware**

```typescript
// middleware.ts
import { updateSession } from "@/lib/supabase/middleware";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: ["/admin/:path*"],
};
```

**Step 2: Verify types**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add middleware.ts
git commit -m "feat: add Next.js middleware protecting /admin routes"
```

---

### Task 4: Create markdown export utility

**Files:**
- Create: `lib/export-markdown.ts`

**Context:** The existing `app/api/export/[token]/route.ts` generates a plain text brief using `FORM_STEPS`. This new utility generates a structured markdown format suitable for Claude Code agent consumption, organized by section rather than by form step.

**Step 1: Create the export function**

```typescript
// lib/export-markdown.ts
import { FORM_STEPS, QUICK_STEPS, STANDARD_STEPS, type Question } from "@/lib/form-steps";

interface FormData {
  [key: string]: string | undefined;
  _source?: string;
  _mode?: string;
}

const DNS_LABELS: Record<string, string> = {
  godaddy: "GoDaddy",
  namecheap: "Namecheap",
  cloudflare: "Cloudflare",
  google: "Google / Squarespace",
  networksolutions: "Network Solutions",
  other: "Other / Not sure",
};

export function generateMarkdown(
  formData: FormData,
  dnsProvider: string | null,
  submittedAt: string | null,
): string {
  const name = formData.business_name || "Unknown Business";
  const source = formData._source || "claim-your-site";
  const date = submittedAt
    ? new Date(submittedAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "N/A";

  const lines: string[] = [];
  lines.push(`# ${name} — Website Brief`);
  lines.push("");
  lines.push(`**Source:** ${source} | **Submitted:** ${date}`);
  lines.push("");

  // Business Details
  lines.push("## Business Details");
  if (formData.business_name) lines.push(`- **Business Name:** ${formData.business_name}`);
  if (formData.contact_person) lines.push(`- **Contact:** ${formData.contact_person}`);
  if (formData.email) lines.push(`- **Email:** ${formData.email}`);
  if (formData.phone) lines.push(`- **Phone:** ${formData.phone}`);
  if (formData.address) lines.push(`- **Address:** ${formData.address}`);
  if (formData.current_url) lines.push(`- **Current URL:** ${formData.current_url}`);
  lines.push("");

  // Service Area
  if (formData.service_areas) {
    lines.push("## Service Area");
    lines.push(formData.service_areas);
    lines.push("");
  }

  // Domain & DNS
  if (formData.domain_name || dnsProvider) {
    lines.push("## Domain & DNS");
    if (formData.domain_name) lines.push(`- **Domain:** ${formData.domain_name}`);
    if (dnsProvider) lines.push(`- **DNS Provider:** ${DNS_LABELS[dnsProvider] || dnsProvider}`);
    lines.push("");
  }

  // Additional Details
  if (formData.details) {
    lines.push("## Additional Details");
    lines.push(formData.details);
    lines.push("");
  }

  // Questionnaire Responses (from multi-step forms)
  const mode = formData._mode as string | undefined;
  let steps = FORM_STEPS;
  if (mode === "quick") steps = QUICK_STEPS;
  else if (mode === "standard") steps = STANDARD_STEPS;

  const knownKeys = new Set([
    "business_name", "contact_person", "email", "phone", "address",
    "current_url", "service_areas", "domain_name", "details",
    "_source", "_mode",
  ]);

  const questionnaireAnswers: { label: string; value: string }[] = [];
  const allQuestions: Question[] = steps.flatMap((s) => s.questions);

  for (const q of allQuestions) {
    if (knownKeys.has(q.id)) continue;
    const val = formData[q.id];
    if (val && val.trim()) {
      questionnaireAnswers.push({ label: q.label, value: val });
    }
  }

  if (questionnaireAnswers.length > 0) {
    lines.push("## Questionnaire Responses");
    for (const a of questionnaireAnswers) {
      lines.push(`### ${a.label}`);
      lines.push(a.value);
      lines.push("");
    }
  }

  return lines.join("\n");
}
```

**Step 2: Verify types**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add lib/export-markdown.ts
git commit -m "feat: add markdown export utility for form submissions"
```

---

### Task 5: Create admin login page

**Files:**
- Create: `app/admin/login/page.tsx`

**Context:** This is a client component with email + password form. Uses `@supabase/ssr` `createBrowserClient` for auth calls. On success, redirects to `/admin`. Uses the main site's cream/orange branding (matching `globals.css` design tokens).

**Step 1: Create the login page**

```tsx
// app/admin/login/page.tsx
"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

export default function AdminLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(
    searchParams.get("error") === "unauthorized" ? "Access denied." : ""
  );
  const [loading, setLoading] = useState(false);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    router.push("/admin");
    router.refresh();
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#faf9f5",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <div style={{ width: "100%", maxWidth: "380px" }}>
        <h1
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: "1.75rem",
            fontWeight: 700,
            color: "#111110",
            marginBottom: "8px",
          }}
        >
          Admin
        </h1>
        <p
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "14px",
            color: "#888886",
            marginBottom: "32px",
          }}
        >
          Sign in to manage submissions.
        </p>

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: "16px" }}>
            <label style={labelStyle}>Email</label>
            <input
              className="field"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>

          <div style={{ marginBottom: "24px" }}>
            <label style={labelStyle}>Password</label>
            <input
              className="field"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "12px",
                color: "#ff3d00",
                marginBottom: "16px",
              }}
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-orange"
            style={{
              width: "100%",
              justifyContent: "center",
              opacity: loading ? 0.5 : 1,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontFamily: "var(--font-sans)",
  fontSize: "14px",
  fontWeight: 500,
  color: "#111110",
  marginBottom: "6px",
};
```

**Step 2: Verify build**

Run: `npx next build`
Expected: Build succeeds (login page compiles)

**Step 3: Commit**

```bash
git add app/admin/login/page.tsx
git commit -m "feat: add admin login page with Supabase Auth"
```

---

### Task 6: Create admin dashboard page (server component)

**Files:**
- Create: `app/admin/page.tsx`

**Context:** Server component that fetches all submitted form sessions from Supabase using the service role key. Passes data to the client `SubmissionsTable` component. Also creates a Supabase SSR client for auth (to show logged-in user and allow logout).

**Step 1: Create a Supabase server client helper for SSR pages**

Add this to the existing server utilities. Create `lib/supabase/server-ssr.ts`:

```typescript
// lib/supabase/server-ssr.ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createSSRClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Can't set cookies in Server Components — only works in
            // Server Actions and Route Handlers
          }
        },
      },
    }
  );
}
```

**Step 2: Create the dashboard page**

```tsx
// app/admin/page.tsx
import { createServerClient } from "@/lib/supabase/server";
import { createSSRClient } from "@/lib/supabase/server-ssr";
import { SubmissionsTable } from "@/components/admin/SubmissionsTable";
import type { FormSession } from "@/lib/supabase/types";

export const metadata = {
  title: "Admin — Obsession Marketing",
};

export default async function AdminPage() {
  const supabase = createServerClient();
  const ssrClient = await createSSRClient();
  const { data: { user } } = await ssrClient.auth.getUser();

  const { data: sessions } = await supabase
    .from("form_sessions")
    .select("*")
    .not("submitted_at", "is", null)
    .order("submitted_at", { ascending: false });

  return (
    <div style={{ minHeight: "100vh", background: "#faf9f5", padding: "32px 24px 80px" }}>
      <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "36px",
          }}
        >
          <div>
            <p
              className="eyebrow"
              style={{ marginBottom: "6px" }}
            >
              Admin
            </p>
            <h1
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: "clamp(1.5rem, 4vw, 2rem)",
                fontWeight: 700,
                color: "#111110",
              }}
            >
              Submissions
            </h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <span
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: "13px",
                color: "#888886",
              }}
            >
              {user?.email}
            </span>
            <LogoutButton />
          </div>
        </div>

        <SubmissionsTable sessions={(sessions as FormSession[]) || []} />
      </div>
    </div>
  );
}

function LogoutButton() {
  return (
    <form action="/admin/logout" method="POST">
      <button
        type="submit"
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "13px",
          fontWeight: 500,
          color: "#888886",
          background: "transparent",
          border: "1.5px solid #d8d6cf",
          borderRadius: "3px",
          padding: "6px 16px",
          cursor: "pointer",
        }}
      >
        Sign Out
      </button>
    </form>
  );
}
```

**Step 3: Create the logout route**

```typescript
// app/admin/logout/route.ts
import { createSSRClient } from "@/lib/supabase/server-ssr";
import { NextResponse } from "next/server";

export async function POST() {
  const supabase = await createSSRClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/admin/login", process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"));
}
```

**Step 4: Verify types**

Run: `npx tsc --noEmit`
Expected: Will fail — `SubmissionsTable` doesn't exist yet. That's expected. Verify no other type errors.

**Step 5: Commit**

```bash
git add lib/supabase/server-ssr.ts app/admin/page.tsx app/admin/logout/route.ts
git commit -m "feat: add admin dashboard page with server-side data fetch"
```

---

### Task 7: Create SubmissionsTable component

**Files:**
- Create: `components/admin/SubmissionsTable.tsx`

**Context:** Client component receiving `FormSession[]` as a prop. Implements client-side sorting, filtering, and row click to open detail drawer. Uses inline styles matching the project's cream/editorial aesthetic. No external table library needed — plain HTML table with custom styling.

**Step 1: Create the component**

```tsx
// components/admin/SubmissionsTable.tsx
"use client";

import { useState, useMemo } from "react";
import type { FormSession } from "@/lib/supabase/types";
import { DetailDrawer } from "./DetailDrawer";

type SortKey = "business_name" | "source" | "email" | "submitted_at";
type SortDir = "asc" | "desc";

const SOURCES = ["all", "claim-your-site", "novalux", "new-client"] as const;

export function SubmissionsTable({ sessions }: { sessions: FormSession[] }) {
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("submitted_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selected, setSelected] = useState<FormSession | null>(null);

  const filtered = useMemo(() => {
    let result = [...sessions];

    // Text search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((s) => {
        const name = (s.form_data?.business_name || "").toLowerCase();
        const email = (s.email || s.form_data?.email || "").toLowerCase();
        return name.includes(q) || email.includes(q);
      });
    }

    // Source filter
    if (sourceFilter !== "all") {
      result = result.filter(
        (s) => (s.form_data?._source || "claim-your-site") === sourceFilter
      );
    }

    // Date range
    if (dateFrom) {
      const from = new Date(dateFrom);
      result = result.filter(
        (s) => s.submitted_at && new Date(s.submitted_at) >= from
      );
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      result = result.filter(
        (s) => s.submitted_at && new Date(s.submitted_at) <= to
      );
    }

    // Sort
    result.sort((a, b) => {
      let aVal = "";
      let bVal = "";

      switch (sortKey) {
        case "business_name":
          aVal = (a.form_data?.business_name || "").toLowerCase();
          bVal = (b.form_data?.business_name || "").toLowerCase();
          break;
        case "source":
          aVal = a.form_data?._source || "claim-your-site";
          bVal = b.form_data?._source || "claim-your-site";
          break;
        case "email":
          aVal = (a.email || a.form_data?.email || "").toLowerCase();
          bVal = (b.email || b.form_data?.email || "").toLowerCase();
          break;
        case "submitted_at":
          aVal = a.submitted_at || "";
          bVal = b.submitted_at || "";
          break;
      }

      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [sessions, search, sourceFilter, dateFrom, dateTo, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ↑" : " ↓";
  };

  return (
    <>
      {/* Filters */}
      <div
        style={{
          display: "flex",
          gap: "12px",
          marginBottom: "20px",
          flexWrap: "wrap",
        }}
      >
        <input
          className="field"
          placeholder="Search name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: "1 1 200px", maxWidth: "280px", padding: "10px 14px", fontSize: "14px" }}
        />
        <select
          className="field"
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          style={{ flex: "0 0 auto", padding: "10px 14px", fontSize: "14px", cursor: "pointer" }}
        >
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {s === "all" ? "All Sources" : s}
            </option>
          ))}
        </select>
        <input
          className="field"
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          style={{ flex: "0 0 auto", padding: "10px 14px", fontSize: "14px" }}
        />
        <input
          className="field"
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          style={{ flex: "0 0 auto", padding: "10px 14px", fontSize: "14px" }}
        />
      </div>

      {/* Count */}
      <p
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "12px",
          color: "#888886",
          marginBottom: "12px",
          letterSpacing: "0.02em",
        }}
      >
        {filtered.length} submission{filtered.length !== 1 ? "s" : ""}
      </p>

      {/* Table */}
      <div
        style={{
          border: "1.5px solid #e8e6df",
          borderRadius: "6px",
          overflow: "hidden",
          background: "#fff",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1.5px solid #e8e6df" }}>
              {(
                [
                  ["business_name", "Business Name"],
                  ["source", "Source"],
                  ["email", "Email"],
                  ["submitted_at", "Submitted"],
                ] as [SortKey, string][]
              ).map(([key, label]) => (
                <th
                  key={key}
                  onClick={() => toggleSort(key)}
                  style={{
                    ...thStyle,
                    cursor: "pointer",
                    userSelect: "none",
                  }}
                >
                  {label}
                  {sortIndicator(key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  style={{
                    ...tdStyle,
                    textAlign: "center",
                    color: "#888886",
                    padding: "40px 16px",
                  }}
                >
                  No submissions found.
                </td>
              </tr>
            ) : (
              filtered.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => setSelected(s)}
                  style={{
                    borderBottom: "1px solid #f0eee8",
                    cursor: "pointer",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "#faf9f5")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "transparent")
                  }
                >
                  <td style={tdStyle}>
                    {s.form_data?.business_name || "—"}
                  </td>
                  <td style={tdStyle}>
                    <span style={badgeStyle}>
                      {s.form_data?._source || "claim-your-site"}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    {s.email || s.form_data?.email || "—"}
                  </td>
                  <td style={tdStyle}>
                    {s.submitted_at
                      ? new Date(s.submitted_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Detail Drawer */}
      {selected && (
        <DetailDrawer
          session={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  fontFamily: "var(--font-sans)",
  fontSize: "12px",
  fontWeight: 600,
  color: "#888886",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  padding: "12px 16px",
  background: "#faf9f5",
};

const tdStyle: React.CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: "14px",
  color: "#111110",
  padding: "14px 16px",
};

const badgeStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "11px",
  fontWeight: 500,
  color: "#ff3d00",
  background: "#fff5f2",
  padding: "3px 8px",
  borderRadius: "3px",
  letterSpacing: "0.02em",
};
```

**Step 2: Verify types**

Run: `npx tsc --noEmit`
Expected: Will show error for missing `DetailDrawer` — that's the next task. No other errors.

**Step 3: Commit**

```bash
git add components/admin/SubmissionsTable.tsx
git commit -m "feat: add submissions table with sorting, filtering, and search"
```

---

### Task 8: Create DetailDrawer component

**Files:**
- Create: `components/admin/DetailDrawer.tsx`

**Context:** Slide-out drawer from the right edge. Shows all form data organized by section. Has "Copy Markdown" and "Download .md" buttons. Uses the `generateMarkdown` function from `lib/export-markdown.ts`.

**Step 1: Create the component**

```tsx
// components/admin/DetailDrawer.tsx
"use client";

import { useEffect, useState } from "react";
import type { FormSession } from "@/lib/supabase/types";
import { generateMarkdown } from "@/lib/export-markdown";

export function DetailDrawer({
  session,
  onClose,
}: {
  session: FormSession;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const fd = session.form_data || {};
  const markdown = generateMarkdown(
    fd as Record<string, string>,
    session.dns_provider,
    session.submitted_at,
  );

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const name = (fd.business_name || "client")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-+$/, "");
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}-brief.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(17,17,16,0.3)",
          zIndex: 50,
        }}
      />

      {/* Drawer */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(520px, 90vw)",
          background: "#fff",
          borderLeft: "1.5px solid #e8e6df",
          zIndex: 51,
          overflowY: "auto",
          padding: "32px 28px 60px",
        }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: "16px",
            right: "16px",
            background: "transparent",
            border: "none",
            fontSize: "20px",
            color: "#888886",
            cursor: "pointer",
            padding: "4px 8px",
          }}
        >
          ✕
        </button>

        {/* Title */}
        <h2
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: "1.5rem",
            fontWeight: 700,
            color: "#111110",
            marginBottom: "4px",
          }}
        >
          {fd.business_name || "Untitled"}
        </h2>
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "12px",
            color: "#888886",
            marginBottom: "28px",
          }}
        >
          {fd._source || "claim-your-site"} &middot;{" "}
          {session.submitted_at
            ? new Date(session.submitted_at).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })
            : "Not submitted"}
        </p>

        {/* Sections */}
        <Section title="Business Details">
          <Row label="Business Name" value={fd.business_name} />
          <Row label="Contact" value={fd.contact_person} />
          <Row label="Email" value={session.email || fd.email} />
          <Row label="Phone" value={fd.phone} />
          <Row label="Address" value={fd.address} />
          <Row label="Current URL" value={fd.current_url} />
        </Section>

        {fd.service_areas && (
          <Section title="Service Area">
            <p style={valueStyle}>{fd.service_areas}</p>
          </Section>
        )}

        {(fd.domain_name || session.dns_provider) && (
          <Section title="Domain & DNS">
            <Row label="Domain" value={fd.domain_name} />
            <Row label="DNS Provider" value={session.dns_provider || fd.dns_provider} />
          </Section>
        )}

        {fd.details && (
          <Section title="Additional Details">
            <p style={valueStyle}>{fd.details}</p>
          </Section>
        )}

        {/* Show any remaining form_data keys not covered above */}
        {(() => {
          const covered = new Set([
            "business_name", "contact_person", "email", "phone", "address",
            "current_url", "service_areas", "domain_name", "dns_provider",
            "details", "_source", "_mode",
          ]);
          const extra = Object.entries(fd).filter(
            ([k, v]) => !covered.has(k) && v && String(v).trim()
          );
          if (extra.length === 0) return null;
          return (
            <Section title="Questionnaire Responses">
              {extra.map(([k, v]) => (
                <Row key={k} label={k.replace(/_/g, " ")} value={String(v)} />
              ))}
            </Section>
          );
        })()}

        {/* Export Actions */}
        <div
          style={{
            display: "flex",
            gap: "10px",
            marginTop: "32px",
            paddingTop: "20px",
            borderTop: "1.5px solid #e8e6df",
          }}
        >
          <button onClick={handleCopy} className="btn-orange" style={{ fontSize: "13px", padding: "10px 20px" }}>
            {copied ? "Copied!" : "Copy Markdown"}
          </button>
          <button onClick={handleDownload} className="btn-outline" style={{ fontSize: "13px", padding: "10px 20px" }}>
            Download .md
          </button>
        </div>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "24px" }}>
      <h3
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "11px",
          fontWeight: 500,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "#ff3d00",
          marginBottom: "12px",
          paddingBottom: "8px",
          borderBottom: "1px solid #f0eee8",
        }}
      >
        {title}
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {children}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", gap: "8px" }}>
      <span
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "13px",
          fontWeight: 500,
          color: "#888886",
          minWidth: "110px",
          flexShrink: 0,
        }}
      >
        {label}
      </span>
      <span style={valueStyle}>{value}</span>
    </div>
  );
}

const valueStyle: React.CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: "14px",
  color: "#111110",
  lineHeight: 1.5,
  wordBreak: "break-word",
};
```

**Step 2: Verify full build**

Run: `npx next build`
Expected: Build succeeds — all components now exist.

**Step 3: Commit**

```bash
git add components/admin/DetailDrawer.tsx
git commit -m "feat: add detail drawer with markdown export"
```

---

### Task 9: Add ADMIN_EMAILS env var and verify end-to-end

**Files:**
- Modify: `.env.local` (add `ADMIN_EMAILS`)

**Step 1: Create an admin user in Supabase**

Go to the Supabase dashboard → Authentication → Users → Add User. Create a user with the desired admin email and password.

**Step 2: Add the env var**

Add to `.env.local`:
```
ADMIN_EMAILS=your-email@example.com
```

Add to Vercel environment variables as well (for production).

**Step 3: Test locally**

Run: `npm run dev`

1. Visit `http://localhost:3000/admin` → should redirect to `/admin/login`
2. Sign in with the admin email + password → should redirect to `/admin`
3. Verify the submissions table shows existing submitted forms
4. Click a row → detail drawer opens with all form data
5. Click "Copy Markdown" → paste in a text editor to verify format
6. Click "Download .md" → file downloads correctly
7. Test filters: type in search, select a source, set date range
8. Test sorting: click column headers

**Step 4: Deploy**

Run: `npx vercel --prod --yes`

**Step 5: Commit any cleanup**

```bash
git add -A
git commit -m "feat: complete admin dashboard with auth, table, and markdown export"
```

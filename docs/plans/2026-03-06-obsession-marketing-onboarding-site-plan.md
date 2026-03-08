# Obsession Marketing Onboarding Site — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a premium dark-themed Next.js marketing site with a 12-step client onboarding questionnaire, save/resume via emailed magic links, file uploads, and provider-specific DNS instructions emailed on submission.

**Architecture:** Next.js 15 App Router with Tailwind + Framer Motion for the animated UI. Supabase stores form sessions as JSONB (no schema migrations needed per step). Resend handles all transactional email. Screenshots of 7 portfolio sites are captured at build time with Playwright and committed as static assets.

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS, Framer Motion, Supabase (Postgres + Storage), Resend, Playwright (screenshot capture only)

---

## Task 1: Scaffold Next.js Project

**Files:**
- Create: `package.json`, `next.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `.env.local`, `.env.example`, `.gitignore`

**Step 1: Initialize project**

```bash
cd "c:\Users\Ben Bybee\Desktop\Websites\Website Reveals"
npx create-next-app@latest . --typescript --tailwind --app --no-src-dir --import-alias "@/*"
```

Accept all defaults. This creates the project in the current directory.

**Step 2: Install dependencies**

```bash
npm install framer-motion @supabase/supabase-js resend uuid
npm install -D @types/uuid playwright
```

**Step 3: Install Google Fonts via next/font**

No install needed — handled in `app/layout.tsx` via `next/font/google`.

**Step 4: Create `.env.local`**

```bash
cp .env.example .env.local
```

Create `.env.example`:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
RESEND_API_KEY=
AGENCY_EMAIL=
AGENCY_IP_ADDRESS=
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

Fill in real values in `.env.local`.

**Step 5: Verify dev server starts**

```bash
npm run dev
```

Expected: Server on http://localhost:3000 with no errors.

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js project with dependencies"
```

---

## Task 2: Design System — Tailwind Config + Global CSS

**Files:**
- Modify: `tailwind.config.ts`
- Modify: `app/globals.css`

**Step 1: Update `tailwind.config.ts`**

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        obsidian: "#0a0a0f",
        "electric-blue": "#3b82f6",
        cyan: "#06b6d4",
        violet: "#8b5cf6",
        lime: "#84cc16",
        "text-primary": "#f8fafc",
        "text-muted": "#94a3b8",
      },
      fontFamily: {
        syne: ["var(--font-syne)", "sans-serif"],
        inter: ["var(--font-inter)", "sans-serif"],
        mono: ["var(--font-jetbrains)", "monospace"],
      },
      animation: {
        "glow-pulse": "glowPulse 2s ease-in-out infinite",
        "float": "float 6s ease-in-out infinite",
        "mesh-shift": "meshShift 12s ease-in-out infinite alternate",
      },
      keyframes: {
        glowPulse: {
          "0%, 100%": { boxShadow: "0 0 20px rgba(59,130,246,0.3)" },
          "50%": { boxShadow: "0 0 40px rgba(59,130,246,0.7), 0 0 80px rgba(6,182,212,0.3)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-20px)" },
        },
        meshShift: {
          "0%": { backgroundPosition: "0% 50%" },
          "100%": { backgroundPosition: "100% 50%" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
```

**Step 2: Update `app/globals.css`**

```css
@import "tailwindcss";

:root {
  --obsidian: #0a0a0f;
  --electric-blue: #3b82f6;
  --cyan: #06b6d4;
  --violet: #8b5cf6;
  --lime: #84cc16;
}

* {
  box-sizing: border-box;
  padding: 0;
  margin: 0;
}

html,
body {
  background-color: #0a0a0f;
  color: #f8fafc;
  scroll-behavior: smooth;
}

/* Scrollbar */
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: #0a0a0f; }
::-webkit-scrollbar-thumb { background: #3b82f6; border-radius: 3px; }

/* Glow utility */
.glow-blue {
  box-shadow: 0 0 20px rgba(59,130,246,0.4), 0 0 60px rgba(59,130,246,0.1);
}
.glow-violet {
  box-shadow: 0 0 20px rgba(139,92,246,0.4), 0 0 60px rgba(139,92,246,0.1);
}
.glow-lime {
  box-shadow: 0 0 20px rgba(132,204,22,0.4), 0 0 60px rgba(132,204,22,0.1);
}

/* Text gradient */
.gradient-text {
  background: linear-gradient(135deg, #3b82f6, #06b6d4);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
```

**Step 3: Update `app/layout.tsx` with fonts**

```typescript
import type { Metadata } from "next";
import { Syne, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-syne",
  weight: ["400", "600", "700", "800"],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
});

export const metadata: Metadata = {
  title: "Website Development | Obsession Marketing",
  description: "Custom websites built to convert. Start your project today.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${syne.variable} ${inter.variable} ${jetbrains.variable}`}>
      <body className="font-inter bg-obsidian text-text-primary antialiased">
        {children}
      </body>
    </html>
  );
}
```

**Step 4: Verify build**

```bash
npm run build
```

Expected: Build succeeds with no TypeScript errors.

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: configure design system, fonts, and global CSS"
```

---

## Task 3: Supabase Setup

**Files:**
- Create: `lib/supabase/client.ts`
- Create: `lib/supabase/server.ts`
- Create: `lib/supabase/types.ts`
- Create: `supabase/migrations/001_form_sessions.sql`

**Step 1: Create Supabase table**

Go to your Supabase project → SQL Editor, run:

```sql
CREATE TABLE form_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token       uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  email       text,
  current_step int DEFAULT 1,
  form_data   jsonb DEFAULT '{}',
  file_urls   jsonb DEFAULT '[]',
  dns_provider text,
  submitted_at timestamp with time zone,
  expires_at  timestamp with time zone NOT NULL DEFAULT now() + interval '30 days',
  created_at  timestamp with time zone NOT NULL DEFAULT now()
);

-- Index for token lookups
CREATE INDEX form_sessions_token_idx ON form_sessions(token);

-- Row Level Security: allow anon to insert and select own rows by token
ALTER TABLE form_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can create a session"
  ON form_sessions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can read by token"
  ON form_sessions FOR SELECT
  USING (true);

CREATE POLICY "Anyone can update by token"
  ON form_sessions FOR UPDATE
  USING (true);
```

Also go to **Storage** → create a bucket named `form-uploads` with public access.

Save the SQL to `supabase/migrations/001_form_sessions.sql`.

**Step 2: Create `lib/supabase/types.ts`**

```typescript
export interface FormSession {
  id: string;
  token: string;
  email: string | null;
  current_step: number;
  form_data: Record<string, unknown>;
  file_urls: string[];
  dns_provider: string | null;
  submitted_at: string | null;
  expires_at: string;
  created_at: string;
}
```

**Step 3: Create `lib/supabase/client.ts`**

```typescript
import { createClient } from "@supabase/supabase-js";

export function createBrowserClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

**Step 4: Create `lib/supabase/server.ts`**

```typescript
import { createClient } from "@supabase/supabase-js";

export function createServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
```

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Supabase client setup and form_sessions table migration"
```

---

## Task 4: API Routes — Form Session CRUD

**Files:**
- Create: `app/api/form/start/route.ts`
- Create: `app/api/form/[token]/route.ts`
- Create: `app/api/form/[token]/save-email/route.ts`
- Create: `app/api/form/[token]/submit/route.ts`

**Step 1: Create `app/api/form/start/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("form_sessions")
    .insert({})
    .select("token")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ token: data.token });
}
```

**Step 2: Create `app/api/form/[token]/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("form_sessions")
    .select("*")
    .eq("token", token)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Check expiry
  if (new Date(data.expires_at) < new Date()) {
    return NextResponse.json({ error: "Session expired" }, { status: 410 });
  }

  return NextResponse.json(data);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const body = await req.json();
  const supabase = createServerClient();

  const { error } = await supabase
    .from("form_sessions")
    .update({
      current_step: body.current_step,
      form_data: body.form_data,
      dns_provider: body.dns_provider ?? null,
    })
    .eq("token", token);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

**Step 3: Create `app/api/form/[token]/save-email/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const { email } = await req.json();

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const supabase = createServerClient();

  const { error } = await supabase
    .from("form_sessions")
    .update({ email })
    .eq("token", token);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const resumeUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/q/${token}`;

  await resend.emails.send({
    from: "Obsession Marketing <onboarding@obsessionmarketing.com>",
    to: email,
    subject: "Continue Your Website Questionnaire",
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0a0a0f;color:#f8fafc;padding:40px;border-radius:12px;">
        <h1 style="color:#3b82f6;font-size:24px;margin-bottom:16px;">Your progress is saved!</h1>
        <p style="color:#94a3b8;margin-bottom:24px;">Click the button below to pick up right where you left off. This link is valid for 30 days.</p>
        <a href="${resumeUrl}" style="display:inline-block;background:linear-gradient(135deg,#3b82f6,#06b6d4);color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;">
          Continue My Questionnaire →
        </a>
        <p style="color:#64748b;margin-top:32px;font-size:12px;">
          Or copy this link: ${resumeUrl}<br/>
          Link expires in 30 days.
        </p>
      </div>
    `,
  });

  return NextResponse.json({ ok: true });
}
```

**Step 4: Create `app/api/form/[token]/submit/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { Resend } from "resend";
import { getDnsInstructions } from "@/lib/dns-instructions";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const supabase = createServerClient();

  const { data: session, error } = await supabase
    .from("form_sessions")
    .select("*")
    .eq("token", token)
    .single();

  if (error || !session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Mark as submitted
  await supabase
    .from("form_sessions")
    .update({ submitted_at: new Date().toISOString() })
    .eq("token", token);

  const formData = session.form_data as Record<string, unknown>;
  const businessName = (formData.business_name as string) || "Your Business";
  const ipAddress = process.env.AGENCY_IP_ADDRESS || "TBD";
  const dnsProvider = session.dns_provider || "other";

  // Email to client
  if (session.email) {
    const dnsHtml = getDnsInstructions(dnsProvider, ipAddress, businessName);
    await resend.emails.send({
      from: "Obsession Marketing <onboarding@obsessionmarketing.com>",
      to: session.email,
      subject: `Next Step: Point Your Domain — ${businessName}`,
      html: dnsHtml,
    });
  }

  // Email to agency
  await resend.emails.send({
    from: "Obsession Marketing Forms <onboarding@obsessionmarketing.com>",
    to: process.env.AGENCY_EMAIL!,
    subject: `New Questionnaire Submission — ${businessName}`,
    html: buildAgencySummary(session),
  });

  return NextResponse.json({ ok: true });
}

function buildAgencySummary(session: Record<string, unknown>): string {
  const formData = (session.form_data as Record<string, unknown>) || {};
  const rows = Object.entries(formData)
    .map(([k, v]) => `<tr><td style="padding:8px;color:#94a3b8;font-weight:600">${k}</td><td style="padding:8px;color:#f8fafc">${JSON.stringify(v)}</td></tr>`)
    .join("");

  return `
    <div style="font-family:sans-serif;max-width:800px;margin:0 auto;background:#0a0a0f;color:#f8fafc;padding:40px;">
      <h1 style="color:#3b82f6">New Submission</h1>
      <p style="color:#94a3b8">DNS Provider: <strong style="color:#f8fafc">${session.dns_provider}</strong></p>
      <p style="color:#94a3b8">Client Email: <strong style="color:#f8fafc">${session.email}</strong></p>
      <p style="color:#94a3b8">File URLs: ${JSON.stringify(session.file_urls)}</p>
      <table style="width:100%;border-collapse:collapse;margin-top:24px;">${rows}</table>
    </div>
  `;
}
```

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add form session API routes (start, get, save, submit)"
```

---

## Task 5: DNS Instructions Library

**Files:**
- Create: `lib/dns-instructions.ts`

**Step 1: Create `lib/dns-instructions.ts`**

This file contains per-provider HTML email instructions.

```typescript
const PROVIDERS: Record<string, { name: string; steps: string[] }> = {
  godaddy: {
    name: "GoDaddy",
    steps: [
      "Log in to your GoDaddy account at godaddy.com",
      "Click your name in the top right → My Products",
      "Find your domain and click <strong>DNS</strong>",
      "Under 'A' records, find the record pointing to your domain (usually @ or blank host)",
      "Click the pencil/edit icon",
      "Change the 'Points to' value to: <strong>{{IP}}</strong>",
      "Set TTL to 1 hour (600 seconds)",
      "Click Save",
      "To grant DNS access: Go to Settings → Delegate Access → Invite <strong>{{AGENCY_EMAIL}}</strong> with 'Domains' permission",
    ],
  },
  namecheap: {
    name: "Namecheap",
    steps: [
      "Log in at namecheap.com",
      "Click Domain List in the left sidebar",
      "Click <strong>Manage</strong> next to your domain",
      "Click the <strong>Advanced DNS</strong> tab",
      "Find the A Record with host '@'",
      "Click the edit icon (pencil)",
      "Change the 'Value' to: <strong>{{IP}}</strong>",
      "Set TTL to Automatic",
      "Click the green checkmark to save",
      "To share access: Go to Profile → Sharing & Transfer → Share this account with <strong>{{AGENCY_EMAIL}}</strong>",
    ],
  },
  cloudflare: {
    name: "Cloudflare",
    steps: [
      "Log in at dash.cloudflare.com",
      "Select your domain from the dashboard",
      "Click <strong>DNS</strong> in the left sidebar",
      "Click <strong>Records</strong>",
      "Find the A record for your root domain (@)",
      "Click <strong>Edit</strong>",
      "Change the IPv4 address to: <strong>{{IP}}</strong>",
      "Set Proxy status to <strong>DNS only</strong> (grey cloud)",
      "Click <strong>Save</strong>",
      "To grant access: Go to Manage Account → Members → Invite <strong>{{AGENCY_EMAIL}}</strong> as Administrator",
    ],
  },
  google: {
    name: "Google Domains / Squarespace DNS",
    steps: [
      "Log in at domains.squarespace.com (formerly Google Domains)",
      "Click your domain name",
      "Click <strong>DNS</strong> in the left panel",
      "Scroll to <strong>Custom records</strong>",
      "Find the A record with host '@'",
      "Click <strong>Edit</strong>",
      "Change the data/value to: <strong>{{IP}}</strong>",
      "Click <strong>Save</strong>",
      "To share access: Scroll to Domain permissions → Add <strong>{{AGENCY_EMAIL}}</strong> as an editor",
    ],
  },
  networksolutions: {
    name: "Network Solutions",
    steps: [
      "Log in at networksolutions.com",
      "Click <strong>My Domains</strong>",
      "Click <strong>Manage</strong> next to your domain",
      "Click <strong>Change Where Domain Points</strong>",
      "Select <strong>Advanced DNS</strong>",
      "Find the A record for your domain",
      "Edit the IP address to: <strong>{{IP}}</strong>",
      "Click <strong>Apply Changes</strong>",
      "For access delegation, call Network Solutions support or email your login credentials securely",
    ],
  },
  other: {
    name: "Your DNS Provider",
    steps: [
      "Log in to wherever you registered your domain",
      "Find the DNS management or DNS settings section",
      "Look for an <strong>A Record</strong> pointing to your root domain (@)",
      "Edit it and change the IP address / value to: <strong>{{IP}}</strong>",
      "Save the change",
      "Email us at <strong>{{AGENCY_EMAIL}}</strong> with your domain registrar login details or a screenshot of your DNS settings so we can assist",
    ],
  },
};

export function getDnsInstructions(
  provider: string,
  ipAddress: string,
  businessName: string
): string {
  const config = PROVIDERS[provider] || PROVIDERS.other;
  const agencyEmail = process.env.AGENCY_EMAIL || "hello@obsessionmarketing.com";

  const stepsHtml = config.steps
    .map((step, i) => {
      const filled = step
        .replace(/{{IP}}/g, ipAddress)
        .replace(/{{AGENCY_EMAIL}}/g, agencyEmail);
      return `
        <li style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.06);color:#e2e8f0;">
          <span style="color:#3b82f6;font-weight:700;margin-right:12px;">${i + 1}.</span>
          ${filled}
        </li>
      `;
    })
    .join("");

  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0a0a0f;color:#f8fafc;padding:40px;border-radius:12px;">
      <div style="margin-bottom:32px;">
        <p style="color:#3b82f6;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;">Obsession Marketing</p>
        <h1 style="font-size:28px;font-weight:800;margin-bottom:12px;">Point Your Domain</h1>
        <p style="color:#94a3b8;">Hi ${businessName} team — here are the steps to connect your domain to your new website on <strong>${config.name}</strong>.</p>
      </div>

      <div style="background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.3);border-radius:8px;padding:16px;margin-bottom:32px;">
        <p style="color:#94a3b8;font-size:12px;margin-bottom:4px;">Your A Record IP Address</p>
        <p style="color:#3b82f6;font-size:24px;font-weight:700;letter-spacing:2px;">${ipAddress}</p>
      </div>

      <ol style="list-style:none;padding:0;margin:0;">
        ${stepsHtml}
      </ol>

      <div style="margin-top:32px;padding:20px;background:rgba(255,255,255,0.04);border-radius:8px;">
        <p style="color:#94a3b8;font-size:14px;">
          DNS changes typically take <strong style="color:#f8fafc">15 minutes to 2 hours</strong> to propagate worldwide.<br/><br/>
          Questions? Reply to this email or contact us at <a href="mailto:${agencyEmail}" style="color:#3b82f6;">${agencyEmail}</a>
        </p>
      </div>
    </div>
  `;
}
```

**Step 2: Commit**

```bash
git add -A
git commit -m "feat: add DNS instructions library with per-provider templates"
```

---

## Task 6: Capture Portfolio Screenshots

**Files:**
- Create: `scripts/capture-screenshots.mjs`
- Create: `public/portfolio/` (directory with 7 screenshots)

**Step 1: Create screenshot script**

```javascript
// scripts/capture-screenshots.mjs
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SITES = [
  { name: "site-1", url: "https://wordpress-1595966-6262657.cloudwaysapps.com/" },
  { name: "site-2", url: "https://wordpress-1595966-6260284.cloudwaysapps.com/" },
  { name: "site-3", url: "https://wordpress-1595966-6257070.cloudwaysapps.com/" },
  { name: "true-beef", url: "https://true-beef.com/" },
  { name: "site-5", url: "https://wordpress-1595966-6256024.cloudwaysapps.com/" },
  { name: "novalux", url: "https://novalux2.websitereveals.com/" },
  { name: "clubhouse-cards", url: "https://clubhousecards.net/" },
];

const outDir = path.join(__dirname, "../public/portfolio");
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();

for (const site of SITES) {
  console.log(`Capturing: ${site.url}`);
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });

  try {
    await page.goto(site.url, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2000);
    await page.screenshot({
      path: path.join(outDir, `${site.name}.png`),
      clip: { x: 0, y: 0, width: 1440, height: 900 },
    });
    console.log(`  ✓ Saved ${site.name}.png`);
  } catch (e) {
    console.error(`  ✗ Failed ${site.name}:`, e.message);
  }

  await page.close();
}

await browser.close();
console.log("Done!");
```

**Step 2: Install Playwright browsers**

```bash
npx playwright install chromium
```

**Step 3: Run the screenshot script**

```bash
node scripts/capture-screenshots.mjs
```

Expected: 7 PNG files in `public/portfolio/`.

**Step 4: Add to package.json scripts**

```json
"scripts": {
  "screenshots": "node scripts/capture-screenshots.mjs"
}
```

**Step 5: Create portfolio metadata file**

Create `lib/portfolio.ts`:

```typescript
export interface PortfolioSite {
  name: string;
  image: string;
  url: string;
  tag: string;
}

export const PORTFOLIO_SITES: PortfolioSite[] = [
  { name: "Site 1", image: "/portfolio/site-1.png", url: "https://wordpress-1595966-6262657.cloudwaysapps.com/", tag: "Local Service" },
  { name: "Site 2", image: "/portfolio/site-2.png", url: "https://wordpress-1595966-6260284.cloudwaysapps.com/", tag: "Small Business" },
  { name: "Site 3", image: "/portfolio/site-3.png", url: "https://wordpress-1595966-6257070.cloudwaysapps.com/", tag: "Service Business" },
  { name: "True Beef", image: "/portfolio/true-beef.png", url: "https://true-beef.com/", tag: "Restaurant" },
  { name: "Site 5", image: "/portfolio/site-5.png", url: "https://wordpress-1595966-6256024.cloudwaysapps.com/", tag: "Local Business" },
  { name: "Novalux", image: "/portfolio/novalux.png", url: "https://novalux2.websitereveals.com/", tag: "Beauty & Wellness" },
  { name: "Clubhouse Cards", image: "/portfolio/clubhouse-cards.png", url: "https://clubhousecards.net/", tag: "E-Commerce" },
];
```

> **Note:** After viewing the screenshots, update `name` and `tag` for each site to reflect what they actually are.

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: add portfolio screenshots and metadata"
```

---

## Task 7: Animated Background Components

**Files:**
- Create: `components/ui/AnimatedBackground.tsx`
- Create: `components/ui/GlowOrbs.tsx`

**Step 1: Create `components/ui/AnimatedBackground.tsx`**

```typescript
"use client";

export function AnimatedBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      {/* Mesh gradient base */}
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse at 20% 50%, rgba(59,130,246,0.08) 0%, transparent 50%),
            radial-gradient(ellipse at 80% 20%, rgba(139,92,246,0.08) 0%, transparent 50%),
            radial-gradient(ellipse at 50% 80%, rgba(6,182,212,0.05) 0%, transparent 50%),
            #0a0a0f
          `,
        }}
      />
      {/* Animated grid lines */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(59,130,246,1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(59,130,246,1) 1px, transparent 1px)
          `,
          backgroundSize: "80px 80px",
        }}
      />
    </div>
  );
}
```

**Step 2: Create `components/ui/GlowOrbs.tsx`**

```typescript
"use client";

import { motion } from "framer-motion";

export function GlowOrbs() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <motion.div
        className="absolute w-96 h-96 rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(59,130,246,0.15) 0%, transparent 70%)",
          top: "10%",
          left: "10%",
          filter: "blur(40px)",
        }}
        animate={{ x: [0, 40, 0], y: [0, -30, 0] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute w-80 h-80 rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)",
          top: "50%",
          right: "5%",
          filter: "blur(40px)",
        }}
        animate={{ x: [0, -30, 0], y: [0, 40, 0] }}
        transition={{ duration: 15, repeat: Infinity, ease: "easeInOut", delay: 2 }}
      />
      <motion.div
        className="absolute w-64 h-64 rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(6,182,212,0.1) 0%, transparent 70%)",
          bottom: "15%",
          left: "30%",
          filter: "blur(30px)",
        }}
        animate={{ x: [0, 20, 0], y: [0, 20, 0] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 4 }}
      />
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: add animated background and glow orb components"
```

---

## Task 8: Landing Page — Hero Section

**Files:**
- Create: `components/landing/Hero.tsx`
- Create: `components/ui/GlowButton.tsx`

**Step 1: Create `components/ui/GlowButton.tsx`**

```typescript
"use client";

import { motion } from "framer-motion";
import Link from "next/link";

interface GlowButtonProps {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
}

export function GlowButton({ href, children, variant = "primary" }: GlowButtonProps) {
  if (variant === "secondary") {
    return (
      <Link
        href={href}
        className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-white/10 text-text-muted hover:text-text-primary hover:border-white/20 transition-all duration-200 font-inter text-sm font-medium"
      >
        {children}
      </Link>
    );
  }

  return (
    <motion.div
      className="relative inline-block"
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      {/* Pulsing ring */}
      <motion.div
        className="absolute inset-0 rounded-lg"
        style={{
          background: "linear-gradient(135deg, #3b82f6, #06b6d4)",
          filter: "blur(8px)",
        }}
        animate={{ opacity: [0.5, 0.8, 0.5] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      />
      <Link
        href={href}
        className="relative inline-flex items-center gap-2 px-6 py-3 rounded-lg font-syne font-semibold text-white text-sm"
        style={{ background: "linear-gradient(135deg, #3b82f6, #06b6d4)" }}
      >
        {children}
      </Link>
    </motion.div>
  );
}
```

**Step 2: Create `components/landing/Hero.tsx`**

```typescript
"use client";

import { motion } from "framer-motion";
import { GlowButton } from "@/components/ui/GlowButton";
import { GlowOrbs } from "@/components/ui/GlowOrbs";

export function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center px-6 overflow-hidden">
      <GlowOrbs />

      <div className="relative z-10 max-w-4xl mx-auto text-center">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/5 mb-8"
        >
          <span className="w-2 h-2 rounded-full bg-lime animate-pulse" />
          <span className="font-mono text-xs text-text-muted tracking-widest uppercase">
            Obsession Marketing — Web Development
          </span>
        </motion.div>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="font-syne font-extrabold text-5xl md:text-7xl leading-tight mb-6"
        >
          Your Website Should
          <br />
          <span className="gradient-text">Work as Hard</span>
          <br />
          as You Do
        </motion.h1>

        {/* Subheadline */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-text-muted text-lg md:text-xl max-w-2xl mx-auto mb-10 font-inter leading-relaxed"
        >
          We build custom websites that attract your ideal customers, earn their trust, and turn visitors into leads — built for your specific market, not a template.
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="flex flex-col sm:flex-row gap-4 justify-center items-center"
        >
          <GlowButton href="/start">Start Your Project →</GlowButton>
          <GlowButton href="#portfolio" variant="secondary">See Our Work ↓</GlowButton>
        </motion.div>

        {/* Stats row */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="flex flex-col sm:flex-row gap-8 justify-center mt-16 pt-8 border-t border-white/5"
        >
          {[
            { value: "47+", label: "Sites Built" },
            { value: "100%", label: "US-Based Team" },
            { value: "5★", label: "Client Rated" },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="font-syne font-extrabold text-3xl gradient-text">{stat.value}</div>
              <div className="font-inter text-sm text-text-muted mt-1">{stat.label}</div>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: add hero section with animated badge, headline, and CTAs"
```

---

## Task 9: Landing Page — Portfolio Section

**Files:**
- Create: `components/landing/Portfolio.tsx`
- Create: `components/ui/BrowserMockup.tsx`

**Step 1: Create `components/ui/BrowserMockup.tsx`**

```typescript
"use client";

import { motion } from "framer-motion";
import Image from "next/image";

interface BrowserMockupProps {
  src: string;
  alt: string;
  url: string;
  tag: string;
  liveUrl: string;
}

export function BrowserMockup({ src, alt, url, tag, liveUrl }: BrowserMockupProps) {
  return (
    <motion.div
      className="group relative rounded-xl overflow-hidden border border-white/8 bg-white/2"
      whileHover={{ scale: 1.02, rotateX: -2, rotateY: 2 }}
      transition={{ duration: 0.3 }}
      style={{ transformStyle: "preserve-3d" }}
    >
      {/* Hover glow */}
      <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{ boxShadow: "inset 0 0 0 1px rgba(59,130,246,0.4), 0 0 40px rgba(59,130,246,0.15)" }}
      />

      {/* Browser chrome */}
      <div className="flex items-center gap-2 px-4 py-3 bg-white/5 border-b border-white/8">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500/60" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
          <div className="w-3 h-3 rounded-full bg-green-500/60" />
        </div>
        <div className="flex-1 mx-2 px-3 py-1 rounded bg-white/5 font-mono text-xs text-text-muted truncate">
          {url}
        </div>
      </div>

      {/* Screenshot */}
      <div className="relative aspect-video overflow-hidden">
        <Image src={src} alt={alt} fill className="object-cover object-top" />

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-obsidian/70 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
          <a
            href={liveUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-5 py-2.5 rounded-lg font-syne font-semibold text-sm text-white"
            style={{ background: "linear-gradient(135deg, #3b82f6, #06b6d4)" }}
          >
            View Live Site →
          </a>
        </div>
      </div>

      {/* Tag */}
      <div className="px-4 py-3 flex items-center justify-between">
        <span className="font-inter text-sm text-text-muted">{alt}</span>
        <span className="font-mono text-xs px-2 py-1 rounded bg-electric-blue/10 text-electric-blue border border-electric-blue/20">
          {tag}
        </span>
      </div>
    </motion.div>
  );
}
```

**Step 2: Create `components/landing/Portfolio.tsx`**

```typescript
"use client";

import { motion } from "framer-motion";
import { BrowserMockup } from "@/components/ui/BrowserMockup";
import { PORTFOLIO_SITES } from "@/lib/portfolio";

export function Portfolio() {
  return (
    <section id="portfolio" className="py-24 px-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <p className="font-mono text-xs text-electric-blue tracking-widest uppercase mb-4">Our Work</p>
          <h2 className="font-syne font-extrabold text-4xl md:text-5xl mb-4">
            Sites We've Built
          </h2>
          <p className="text-text-muted max-w-xl mx-auto font-inter">
            Real websites built for real businesses — every one designed to attract leads and build trust.
          </p>
        </motion.div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {PORTFOLIO_SITES.map((site, i) => (
            <motion.div
              key={site.name}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
            >
              <BrowserMockup
                src={site.image}
                alt={site.name}
                url={new URL(site.url).hostname}
                tag={site.tag}
                liveUrl={site.url}
              />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: add portfolio section with browser mockup cards"
```

---

## Task 10: Landing Page — Process, Trust & Final CTA Sections

**Files:**
- Create: `components/landing/Process.tsx`
- Create: `components/landing/FinalCTA.tsx`

**Step 1: Create `components/landing/Process.tsx`**

```typescript
"use client";

import { motion } from "framer-motion";

const STEPS = [
  { number: "01", title: "Discovery", desc: "We learn your business, goals, and audience through our detailed questionnaire." },
  { number: "02", title: "Design", desc: "We craft a custom design that reflects your brand and speaks to your ideal customers." },
  { number: "03", title: "Build", desc: "We build your site on a fast, reliable platform — optimized for search and conversion." },
  { number: "04", title: "Launch", desc: "We handle DNS, go-live, and make sure everything is perfect before handing you the keys." },
];

export function Process() {
  return (
    <section className="py-24 px-6 relative">
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(139,92,246,0.05) 0%, transparent 60%)" }}
      />
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <p className="font-mono text-xs text-violet tracking-widest uppercase mb-4">How It Works</p>
          <h2 className="font-syne font-extrabold text-4xl md:text-5xl">
            From Zero to Live
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {STEPS.map((step, i) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.15 }}
              className="relative p-6 rounded-xl border border-white/8 bg-white/2 group hover:border-violet/30 transition-all duration-300"
            >
              <div className="font-mono text-5xl font-bold text-white/5 mb-4 group-hover:text-violet/20 transition-colors">
                {step.number}
              </div>
              <h3 className="font-syne font-bold text-xl mb-2">{step.title}</h3>
              <p className="font-inter text-sm text-text-muted leading-relaxed">{step.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

**Step 2: Create `components/landing/FinalCTA.tsx`**

```typescript
"use client";

import { motion } from "framer-motion";
import { GlowButton } from "@/components/ui/GlowButton";

export function FinalCTA() {
  return (
    <section className="py-24 px-6">
      <div className="max-w-3xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="relative p-12 rounded-2xl text-center overflow-hidden"
          style={{
            background: "linear-gradient(135deg, rgba(59,130,246,0.08), rgba(139,92,246,0.08))",
            border: "1px solid rgba(59,130,246,0.2)",
            boxShadow: "0 0 60px rgba(59,130,246,0.08)",
          }}
        >
          <p className="font-mono text-xs text-electric-blue tracking-widest uppercase mb-6">Ready to Start?</p>
          <h2 className="font-syne font-extrabold text-4xl md:text-5xl mb-6">
            Let's Build Your <span className="gradient-text">Dream Website</span>
          </h2>
          <p className="font-inter text-text-muted mb-8 max-w-md mx-auto">
            Fill out our onboarding questionnaire and we'll have everything we need to get started on your custom website.
          </p>
          <GlowButton href="/start">Start Your Questionnaire →</GlowButton>
          <p className="font-mono text-xs text-text-muted mt-6">
            Takes ~20 minutes · Save and return anytime · No account required
          </p>
        </motion.div>
      </div>
    </section>
  );
}
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: add process steps and final CTA sections"
```

---

## Task 11: Landing Page — Assemble `app/page.tsx`

**Files:**
- Modify: `app/page.tsx`
- Create: `components/landing/Navbar.tsx`
- Create: `components/landing/Footer.tsx`

**Step 1: Create `components/landing/Navbar.tsx`**

```typescript
import Link from "next/link";
import { GlowButton } from "@/components/ui/GlowButton";

export function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 backdrop-blur-md border-b border-white/5 bg-obsidian/60">
      <Link href="/" className="font-syne font-bold text-lg">
        <span className="gradient-text">Obsession</span>
        <span className="text-text-muted font-normal"> Marketing</span>
      </Link>
      <div className="flex items-center gap-6">
        <Link href="#portfolio" className="hidden md:block font-inter text-sm text-text-muted hover:text-text-primary transition-colors">
          Our Work
        </Link>
        <Link href="#process" className="hidden md:block font-inter text-sm text-text-muted hover:text-text-primary transition-colors">
          How It Works
        </Link>
        <GlowButton href="/start">Get Started</GlowButton>
      </div>
    </nav>
  );
}
```

**Step 2: Create `components/landing/Footer.tsx`**

```typescript
export function Footer() {
  return (
    <footer className="py-12 px-6 border-t border-white/5">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <p className="font-syne font-bold">
          <span className="gradient-text">Obsession</span>
          <span className="text-text-muted font-normal"> Marketing</span>
        </p>
        <p className="font-inter text-sm text-text-muted">
          © {new Date().getFullYear()} Obsession Marketing. All rights reserved.
        </p>
        <a
          href="https://obsessionmarketing.com"
          target="_blank"
          rel="noopener noreferrer"
          className="font-inter text-sm text-electric-blue hover:underline"
        >
          obsessionmarketing.com
        </a>
      </div>
    </footer>
  );
}
```

**Step 3: Update `app/page.tsx`**

```typescript
import { AnimatedBackground } from "@/components/ui/AnimatedBackground";
import { Navbar } from "@/components/landing/Navbar";
import { Hero } from "@/components/landing/Hero";
import { Portfolio } from "@/components/landing/Portfolio";
import { Process } from "@/components/landing/Process";
import { FinalCTA } from "@/components/landing/FinalCTA";
import { Footer } from "@/components/landing/Footer";

export default function HomePage() {
  return (
    <main>
      <AnimatedBackground />
      <Navbar />
      <Hero />
      <Portfolio />
      <Process />
      <FinalCTA />
      <Footer />
    </main>
  );
}
```

**Step 4: Run dev server and verify page renders**

```bash
npm run dev
```

Visit http://localhost:3000. Expected: Full landing page with hero, portfolio grid, process steps, and CTA.

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: assemble landing page with all sections"
```

---

## Task 12: Questionnaire — Form State & Step Definitions

**Files:**
- Create: `lib/form-steps.ts`
- Create: `lib/use-form-session.ts`

**Step 1: Create `lib/form-steps.ts`**

This file defines all 12 steps and their questions.

```typescript
export interface Question {
  id: string;
  label: string;
  type: "text" | "textarea" | "email" | "tel" | "radio" | "checkbox" | "file" | "repeatable" | "dns-selector";
  placeholder?: string;
  options?: string[];
  required?: boolean;
  hint?: string;
}

export interface FormStep {
  step: number;
  title: string;
  subtitle: string;
  icon: string;
  questions: Question[];
}

export const FORM_STEPS: FormStep[] = [
  {
    step: 1,
    title: "Tell Us About Your Business",
    subtitle: "Business Basics",
    icon: "🏢",
    questions: [
      { id: "business_name", label: "What is your business name?", type: "text", required: true },
      { id: "website_name", label: "What name should appear on the website?", type: "text" },
      { id: "phone", label: "Primary business phone number", type: "tel" },
      { id: "email", label: "Primary business email address", type: "email" },
      { id: "address", label: "Business address", type: "text" },
      { id: "address_display", label: "Show on website?", type: "radio", options: ["Full address", "City/State only", "Don't show address"] },
      { id: "service_areas", label: "Cities, regions, or service areas you serve", type: "textarea" },
      { id: "excluded_areas", label: "Any locations you do NOT want to target?", type: "textarea" },
      { id: "contact_person", label: "Best contact person for this project", type: "text" },
      { id: "business_hours", label: "Business hours", type: "textarea" },
      { id: "contact_method", label: "Preferred customer contact method", type: "radio", options: ["Phone call", "Text message", "Email", "Contact form", "Multiple"] },
      { id: "social_media", label: "Social media accounts to link on the website", type: "textarea", hint: "e.g. facebook.com/yourbusiness, instagram.com/yourbusiness" },
      { id: "domain_owned", label: "Do you already own your domain name?", type: "radio", options: ["Yes", "No", "Not sure"] },
      { id: "domain_name", label: "If yes, what is your domain name?", type: "text", placeholder: "yourbusiness.com" },
      { id: "dns_provider", label: "Who manages your domain/DNS?", type: "dns-selector" },
    ],
  },
  {
    step: 2,
    title: "What Should This Website Do?",
    subtitle: "Website Goals",
    icon: "🎯",
    questions: [
      { id: "why_building", label: "Why are you building or redesigning your website right now?", type: "textarea" },
      { id: "top_goals", label: "What are the top 3 goals for this website?", type: "textarea" },
      { id: "visitor_actions", label: "What actions do you want visitors to take?", type: "textarea" },
      { id: "success_definition", label: "What would make this website a success in your eyes?", type: "textarea" },
      { id: "current_site_problems", label: "What are the biggest problems with your current website?", type: "textarea" },
      { id: "missing_online", label: "If no current website, what has been missing from your online presence?", type: "textarea" },
      { id: "what_hasnt_worked", label: "What has NOT worked well for you in the past with marketing or websites?", type: "textarea" },
      { id: "business_goals", label: "Business goals this site should support over the next 6–12 months", type: "textarea" },
      { id: "customer_type", label: "Is this website mainly for:", type: "radio", options: ["New customers", "Returning customers", "Both"] },
    ],
  },
  {
    step: 3,
    title: "Who Are You Trying to Reach?",
    subtitle: "Target Audience",
    icon: "👥",
    questions: [
      { id: "ideal_customer", label: "Who is your ideal customer?", type: "textarea" },
      { id: "profitable_customer", label: "What type of customer is most profitable for your business?", type: "textarea" },
      { id: "geographic_priority", label: "What geographic areas are most important for new customers?", type: "textarea" },
      { id: "customer_problems", label: "What problems are customers typically dealing with before they contact you?", type: "textarea" },
      { id: "motivation_to_reach_out", label: "What motivates them to finally reach out?", type: "textarea" },
      { id: "objections", label: "What concerns or objections do they usually have before buying?", type: "textarea" },
      { id: "what_they_care_about", label: "What do they care about most when choosing a business like yours?", type: "textarea" },
      { id: "customer_outcome", label: "What are customers hoping to achieve after working with you?", type: "textarea" },
      { id: "unwanted_customers", label: "Are there customer types you do NOT want to attract?", type: "textarea" },
      { id: "search_phrases", label: "What would customers search on Google to find you?", type: "textarea", hint: "e.g. 'plumber near me', 'best pizza in Austin'" },
    ],
  },
  {
    step: 4,
    title: "Your Brand Look and Feel",
    subtitle: "Brand Identity",
    icon: "🎨",
    questions: [
      { id: "has_logo", label: "Do you have an existing logo?", type: "radio", options: ["Yes", "No", "In progress"] },
      { id: "logo_files", label: "Upload your logo files", type: "file" },
      { id: "has_alternate_logos", label: "Do you have alternate logo versions?", type: "radio", options: ["Yes", "No"] },
      { id: "brand_colors", label: "What are your brand colors?", type: "textarea", hint: "e.g. Navy blue and gold" },
      { id: "hex_codes", label: "Exact hex codes if you know them", type: "text", placeholder: "#1a2b3c, #d4af37" },
      { id: "brand_fonts", label: "Do you have brand fonts to use on the website?", type: "radio", options: ["Yes", "No"] },
      { id: "font_names", label: "If yes, what are the font names?", type: "text" },
      { id: "brand_guidelines", label: "Upload brand guidelines or style guide (if you have one)", type: "file" },
      { id: "look_and_feel", label: "How would you describe the desired look and feel?", type: "textarea" },
      { id: "brand_personality", label: "Words that should describe your brand personality", type: "textarea", hint: "e.g. Professional, warm, approachable, bold" },
      { id: "brand_not", label: "Words that should NOT describe your brand", type: "textarea" },
      { id: "avoid_design", label: "Any colors, styles, or design trends to avoid?", type: "textarea" },
      { id: "brand_photos", label: "Upload any photos that reflect your brand", type: "file" },
      { id: "brand_feel", label: "Should the site feel more:", type: "radio", options: ["Personal", "Corporate", "Local", "Premium", "Mix of several"] },
    ],
  },
  {
    step: 5,
    title: "What Makes You Different?",
    subtitle: "Competitive Positioning",
    icon: "⚡",
    questions: [
      { id: "differentiators", label: "What differentiates your business from competitors?", type: "textarea" },
      { id: "why_choose_you", label: "Why do customers choose you instead of someone else?", type: "textarea" },
      { id: "do_better", label: "What do you do better than others in your industry?", type: "textarea" },
      { id: "compliments", label: "What do customers compliment you on most often?", type: "textarea" },
      { id: "unique_offerings", label: "Do you offer anything unique that competitors typically do not?", type: "textarea" },
      { id: "selling_points", label: "What are your strongest selling points?", type: "textarea" },
      { id: "trust_builders", label: "Guarantees, warranties, certifications, awards, or credentials", type: "textarea" },
      { id: "media_features", label: "Have you been featured in media or local organizations?", type: "textarea" },
      { id: "misconceptions", label: "Common misconceptions about your business the website should clear up", type: "textarea" },
      { id: "never_say", label: "What do you NEVER want your website copy to say or imply?", type: "textarea" },
    ],
  },
  {
    step: 6,
    title: "Existing Website + Sites You Love",
    subtitle: "Inspiration",
    icon: "🔍",
    questions: [
      { id: "current_url", label: "What is your current website URL?", type: "text", placeholder: "https://yoursite.com" },
      { id: "current_likes", label: "What do you like about your current website?", type: "textarea" },
      { id: "current_dislikes", label: "What do you dislike about your current website?", type: "textarea" },
      { id: "keep_content", label: "What pages or content from your current site should definitely stay?", type: "textarea" },
      { id: "remove_content", label: "What pages or content should be removed or replaced?", type: "textarea" },
      { id: "inspiration_sites", label: "Share 2–3 websites you love (can be any industry)", type: "textarea", hint: "Include what you like about each one" },
      { id: "dislike_styles", label: "Are there any website styles you strongly dislike?", type: "textarea" },
      { id: "content_preference", label: "Do you prefer:", type: "radio", options: ["Image-heavy", "Text-driven", "Balance of both"] },
    ],
  },
  {
    step: 7,
    title: "What You Sell and How You Explain It",
    subtitle: "Services & Offers",
    icon: "💼",
    questions: [
      { id: "all_services", label: "List all services you offer", type: "textarea" },
      { id: "priority_services", label: "Which services are highest priority to promote?", type: "textarea" },
      { id: "profitable_services", label: "Which services are most profitable?", type: "textarea" },
      { id: "most_leads", label: "Which services do you want the most leads for?", type: "textarea" },
      { id: "seasonal_services", label: "Any seasonal services or limited-time offers?", type: "textarea" },
      { id: "service_details", label: "For each main service, describe: name, short description, who it's for, main problem it solves, main benefit, starting price, common questions", type: "textarea" },
      { id: "packages", label: "Do you have service packages, tiers, or bundles?", type: "textarea" },
      { id: "downplay_services", label: "Any services you want to downplay or not feature prominently?", type: "textarea" },
      { id: "financing", label: "Do you have financing options, payment plans, or promotions?", type: "textarea" },
      { id: "products", label: "Any products sold online or in person that should be included?", type: "textarea" },
    ],
  },
  {
    step: 8,
    title: "What Your Customers Struggle With",
    subtitle: "Problems & Solutions",
    icon: "🔧",
    questions: [
      { id: "pre_find_problems", label: "What problems are customers experiencing before they find you?", type: "textarea" },
      { id: "problem_impact", label: "How do those problems affect their life, business, comfort, time, or money?", type: "textarea" },
      { id: "do_nothing", label: "What happens if they do nothing?", type: "textarea" },
      { id: "how_you_solve", label: "How does your business solve those problems?", type: "textarea" },
      { id: "results", label: "What results do customers typically get after working with you?", type: "textarea" },
      { id: "fears", label: "What fears or hesitations do people have before buying from you?", type: "textarea" },
      { id: "confidence_builders", label: "What do customers need to hear to feel confident contacting you?", type: "textarea" },
      { id: "pre_buy_questions", label: "Top questions customers ask before they buy", type: "textarea" },
      { id: "common_objections", label: "What objections do customers commonly raise?", type: "textarea" },
      { id: "overcome_objections", label: "What would you say to overcome those objections?", type: "textarea" },
    ],
  },
  {
    step: 9,
    title: "Content, Messaging, and FAQs",
    subtitle: "Content Strategy",
    icon: "✍️",
    questions: [
      { id: "rewrite_content", label: "Do you want us to rewrite and improve your current content?", type: "radio", options: ["Yes, rewrite everything", "Improve what I have", "Keep my content as-is"] },
      { id: "existing_pages", label: "What pages do you already have content for?", type: "textarea" },
      { id: "main_faqs", label: "What are the main FAQs you want answered on the site?", type: "textarea" },
      { id: "specific_phrases", label: "Specific phrases, terminology, or messaging you want used", type: "textarea" },
      { id: "avoid_phrases", label: "Words or phrases you do NOT want used", type: "textarea" },
      { id: "testimonials", label: "Do you have testimonials or reviews to feature?", type: "textarea", hint: "Paste them here or let us know where to find them" },
      { id: "team_bios", label: "Do you have team bios to include?", type: "textarea" },
      { id: "company_story", label: "Do you have a company story or About Us story?", type: "textarea" },
      { id: "mission_statement", label: "Mission statement, vision statement, or core values?", type: "textarea" },
      { id: "want_blog", label: "Do you want blog content or resources on the site?", type: "radio", options: ["Yes", "No", "Maybe later"] },
    ],
  },
  {
    step: 10,
    title: "Photos, Videos, and Visual Assets",
    subtitle: "Media Uploads",
    icon: "📸",
    questions: [
      { id: "upload_logo", label: "Upload your logo", type: "file" },
      { id: "brand_photos_upload", label: "Upload brand photos", type: "file" },
      { id: "team_photos", label: "Upload team photos", type: "file" },
      { id: "project_photos", label: "Upload project, product, or service images", type: "file" },
      { id: "before_after", label: "Upload before and after images", type: "file" },
      { id: "videos", label: "Upload videos you want used on the site", type: "file" },
      { id: "hero_images", label: "Any specific images you definitely want featured on the homepage?", type: "textarea" },
      { id: "has_pro_photography", label: "Do you have professional photography?", type: "radio", options: ["Yes, professional photos", "Mix of pro and personal", "Mostly personal/phone photos", "No photos yet"] },
      { id: "avoid_images", label: "Any images we should avoid using?", type: "textarea" },
    ],
  },
  {
    step: 11,
    title: "Pages and Navigation",
    subtitle: "Site Structure",
    icon: "🗺️",
    questions: [
      { id: "needed_pages", label: "What pages do you think the website needs?", type: "textarea" },
      { id: "standard_pages", label: "Which of these standard pages do you need?", type: "checkbox", options: ["Home", "About", "Services", "Individual service pages", "Contact", "FAQ", "Blog", "Gallery", "Testimonials", "Financing", "Careers", "Team", "Resources", "Privacy Policy", "Terms and Conditions"] },
      { id: "want_blog_section", label: "Do you want a blog or article section?", type: "radio", options: ["Yes", "No", "Not sure yet"] },
    ],
  },
  {
    step: 12,
    title: "Anything Else We Should Know?",
    subtitle: "Final Notes",
    icon: "📝",
    questions: [
      { id: "anything_else", label: "Is there anything important we haven't asked that we should know?", type: "textarea" },
      { id: "specific_requests", label: "Any specific concerns, requests, or must-haves for this project?", type: "textarea" },
      { id: "definitely_not", label: "Is there anything you definitely do NOT want on the website?", type: "textarea" },
      { id: "success_feeling", label: "What would make you feel like this project was a win?", type: "textarea" },
    ],
  },
];
```

**Step 2: Create `lib/use-form-session.ts`**

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";

const LOCAL_KEY = "om_form_session";

interface SessionState {
  token: string | null;
  currentStep: number;
  formData: Record<string, unknown>;
  dnsProvider: string;
}

export function useFormSession(initialToken?: string) {
  const [state, setState] = useState<SessionState>({
    token: initialToken || null,
    currentStep: 1,
    formData: {},
    dnsProvider: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // On mount: load from server (if token) or localStorage
  useEffect(() => {
    async function load() {
      if (initialToken) {
        const res = await fetch(`/api/form/${initialToken}`);
        if (res.ok) {
          const data = await res.json();
          setState({
            token: initialToken,
            currentStep: data.current_step,
            formData: data.form_data,
            dnsProvider: data.dns_provider || "",
          });
        }
      } else {
        // Try localStorage
        const saved = localStorage.getItem(LOCAL_KEY);
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            setState(parsed);
          } catch {}
        }
      }
      setLoading(false);
    }
    load();
  }, [initialToken]);

  // Persist to localStorage whenever state changes
  useEffect(() => {
    if (!loading) {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(state));
    }
  }, [state, loading]);

  const ensureToken = useCallback(async (): Promise<string> => {
    if (state.token) return state.token;
    const res = await fetch("/api/form/start", { method: "POST" });
    const { token } = await res.json();
    setState((s) => ({ ...s, token }));
    return token;
  }, [state.token]);

  const updateField = useCallback((fieldId: string, value: unknown) => {
    setState((s) => ({
      ...s,
      formData: { ...s.formData, [fieldId]: value },
      ...(fieldId === "dns_provider" ? { dnsProvider: value as string } : {}),
    }));
  }, []);

  const saveToServer = useCallback(async () => {
    setSaving(true);
    const token = await ensureToken();
    await fetch(`/api/form/${token}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        current_step: state.currentStep,
        form_data: state.formData,
        dns_provider: state.dnsProvider || null,
      }),
    });
    setSaving(false);
    return token;
  }, [state, ensureToken]);

  const nextStep = useCallback(async () => {
    const newStep = Math.min(state.currentStep + 1, 12);
    setState((s) => ({ ...s, currentStep: newStep }));
    // Auto-save on step advance
    const token = await ensureToken();
    await fetch(`/api/form/${token}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        current_step: newStep,
        form_data: state.formData,
        dns_provider: state.dnsProvider || null,
      }),
    });
  }, [state, ensureToken]);

  const prevStep = useCallback(() => {
    setState((s) => ({ ...s, currentStep: Math.max(s.currentStep - 1, 1) }));
  }, []);

  return {
    ...state,
    loading,
    saving,
    updateField,
    saveToServer,
    nextStep,
    prevStep,
  };
}
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: add form step definitions and form session hook"
```

---

## Task 13: Questionnaire — UI Components

**Files:**
- Create: `components/form/FormLayout.tsx`
- Create: `components/form/ProgressBar.tsx`
- Create: `components/form/StepCard.tsx`
- Create: `components/form/QuestionField.tsx`
- Create: `components/form/DnsSelector.tsx`
- Create: `components/form/SaveModal.tsx`

**Step 1: Create `components/form/ProgressBar.tsx`**

```typescript
"use client";

import { motion } from "framer-motion";

interface ProgressBarProps {
  current: number;
  total: number;
}

export function ProgressBar({ current, total }: ProgressBarProps) {
  const pct = Math.round(((current - 1) / total) * 100);
  return (
    <div className="flex-1 mx-8">
      <div className="h-1.5 bg-white/8 rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ background: "linear-gradient(90deg, #3b82f6, #06b6d4)" }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
      </div>
      <p className="font-mono text-xs text-text-muted text-center mt-1.5">
        Step {current} of {total}
      </p>
    </div>
  );
}
```

**Step 2: Create `components/form/FormLayout.tsx`**

```typescript
"use client";

import Link from "next/link";
import { ProgressBar } from "./ProgressBar";
import { AnimatedBackground } from "@/components/ui/AnimatedBackground";

interface FormLayoutProps {
  currentStep: number;
  totalSteps: number;
  children: React.ReactNode;
  onSave: () => void;
}

export function FormLayout({ currentStep, totalSteps, children, onSave }: FormLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col">
      <AnimatedBackground />

      {/* Top bar */}
      <header className="flex items-center px-6 py-4 border-b border-white/5 bg-obsidian/80 backdrop-blur-md z-10">
        <Link href="/" className="font-syne font-bold text-sm flex-shrink-0">
          <span className="gradient-text">Obsession</span>
          <span className="text-text-muted font-normal"> Marketing</span>
        </Link>
        <ProgressBar current={currentStep} total={totalSteps} />
        <button
          onClick={onSave}
          className="flex-shrink-0 font-mono text-xs text-text-muted hover:text-electric-blue transition-colors border border-white/10 hover:border-electric-blue/30 px-3 py-1.5 rounded-lg"
        >
          Save & Resume Later
        </button>
      </header>

      {/* Content */}
      <main className="flex-1 flex items-start justify-center px-4 py-12 z-10 relative">
        <div className="w-full max-w-2xl">
          {children}
        </div>
      </main>
    </div>
  );
}
```

**Step 3: Create `components/form/StepCard.tsx`**

```typescript
"use client";

import { motion, AnimatePresence } from "framer-motion";

interface StepCardProps {
  icon: string;
  title: string;
  subtitle: string;
  direction: number;
  children: React.ReactNode;
  stepKey: number;
}

export function StepCard({ icon, title, subtitle, direction, children, stepKey }: StepCardProps) {
  return (
    <AnimatePresence mode="wait" custom={direction}>
      <motion.div
        key={stepKey}
        custom={direction}
        initial={{ x: direction > 0 ? 60 : -60, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: direction > 0 ? -60 : 60, opacity: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="rounded-2xl border border-white/8 bg-white/2 p-8"
        style={{ boxShadow: "0 0 60px rgba(59,130,246,0.05), inset 0 0 0 1px rgba(255,255,255,0.04)" }}
      >
        {/* Step header */}
        <div className="mb-8">
          <span className="text-3xl mb-3 block">{icon}</span>
          <p className="font-mono text-xs text-electric-blue tracking-widest uppercase mb-2">{subtitle}</p>
          <h1 className="font-syne font-extrabold text-3xl">{title}</h1>
        </div>

        {/* Questions */}
        <div className="space-y-6">
          {children}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
```

**Step 4: Create `components/form/DnsSelector.tsx`**

```typescript
"use client";

const PROVIDERS = [
  { id: "godaddy", name: "GoDaddy", desc: "Most common for small businesses", icon: "🟢" },
  { id: "namecheap", name: "Namecheap", desc: "Popular developer choice", icon: "🔵" },
  { id: "cloudflare", name: "Cloudflare", desc: "Best performance & security", icon: "🟠" },
  { id: "google", name: "Google / Squarespace DNS", desc: "Simple, clean interface", icon: "🔴" },
  { id: "networksolutions", name: "Network Solutions", desc: "Legacy provider", icon: "⚫" },
  { id: "other", name: "Other / Not sure", desc: "We'll help you figure it out", icon: "❓" },
];

interface DnsSelectorProps {
  value: string;
  onChange: (val: string) => void;
}

export function DnsSelector({ value, onChange }: DnsSelectorProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
      {PROVIDERS.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onChange(p.id)}
          className={`text-left p-4 rounded-xl border transition-all duration-200 ${
            value === p.id
              ? "border-electric-blue bg-electric-blue/10 shadow-[0_0_20px_rgba(59,130,246,0.2)]"
              : "border-white/8 bg-white/2 hover:border-white/20"
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <span>{p.icon}</span>
            <span className="font-syne font-semibold text-sm">{p.name}</span>
          </div>
          <p className="font-inter text-xs text-text-muted">{p.desc}</p>
        </button>
      ))}
    </div>
  );
}
```

**Step 5: Create `components/form/QuestionField.tsx`**

```typescript
"use client";

import { Question } from "@/lib/form-steps";
import { DnsSelector } from "./DnsSelector";

interface QuestionFieldProps {
  question: Question;
  value: unknown;
  onChange: (val: unknown) => void;
}

const inputClass = "w-full px-4 py-3 rounded-xl bg-white/4 border border-white/10 font-inter text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-electric-blue/50 focus:bg-white/6 transition-all duration-200";

export function QuestionField({ question, value, onChange }: QuestionFieldProps) {
  const strVal = (value as string) || "";

  switch (question.type) {
    case "dns-selector":
      return (
        <div>
          <label className="block font-inter text-sm font-medium mb-2">{question.label}</label>
          <DnsSelector value={strVal} onChange={onChange} />
        </div>
      );

    case "textarea":
      return (
        <div>
          <label className="block font-inter text-sm font-medium mb-2">
            {question.label}
            {question.required && <span className="text-electric-blue ml-1">*</span>}
          </label>
          {question.hint && <p className="font-mono text-xs text-text-muted mb-2">{question.hint}</p>}
          <textarea
            className={`${inputClass} min-h-[100px] resize-y`}
            placeholder={question.placeholder}
            value={strVal}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      );

    case "radio":
      return (
        <div>
          <label className="block font-inter text-sm font-medium mb-3">{question.label}</label>
          <div className="flex flex-wrap gap-2">
            {question.options?.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => onChange(opt)}
                className={`px-4 py-2 rounded-lg text-sm font-inter border transition-all duration-200 ${
                  strVal === opt
                    ? "border-electric-blue bg-electric-blue/10 text-text-primary"
                    : "border-white/10 bg-white/4 text-text-muted hover:border-white/20"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      );

    case "checkbox":
      const arrVal = (value as string[]) || [];
      return (
        <div>
          <label className="block font-inter text-sm font-medium mb-3">{question.label}</label>
          <div className="grid grid-cols-2 gap-2">
            {question.options?.map((opt) => {
              const checked = arrVal.includes(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    const next = checked ? arrVal.filter((v) => v !== opt) : [...arrVal, opt];
                    onChange(next);
                  }}
                  className={`text-left px-3 py-2 rounded-lg text-sm font-inter border transition-all duration-200 ${
                    checked
                      ? "border-electric-blue bg-electric-blue/10 text-text-primary"
                      : "border-white/10 bg-white/4 text-text-muted hover:border-white/20"
                  }`}
                >
                  {checked ? "✓ " : ""}{opt}
                </button>
              );
            })}
          </div>
        </div>
      );

    case "file":
      return (
        <div>
          <label className="block font-inter text-sm font-medium mb-2">{question.label}</label>
          <div className="border-2 border-dashed border-white/10 rounded-xl p-8 text-center hover:border-electric-blue/30 transition-colors cursor-pointer">
            <p className="font-mono text-xs text-text-muted">Click to upload or drag & drop</p>
            <p className="font-mono text-xs text-text-muted/50 mt-1">PNG, JPG, PDF, AI, SVG, MP4 accepted</p>
            <input
              type="file"
              multiple
              className="absolute inset-0 opacity-0 cursor-pointer"
              onChange={(e) => {
                // File upload handled in Task 14
                const files = Array.from(e.target.files || []);
                onChange(files.map((f) => f.name));
              }}
            />
          </div>
        </div>
      );

    default: // text, email, tel
      return (
        <div>
          <label className="block font-inter text-sm font-medium mb-2">
            {question.label}
            {question.required && <span className="text-electric-blue ml-1">*</span>}
          </label>
          <input
            type={question.type}
            className={inputClass}
            placeholder={question.placeholder}
            value={strVal}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      );
  }
}
```

**Step 6: Create `components/form/SaveModal.tsx`**

```typescript
"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface SaveModalProps {
  isOpen: boolean;
  token: string | null;
  onClose: () => void;
  onSave: (email: string) => Promise<void>;
}

export function SaveModal({ isOpen, token, onClose, onSave }: SaveModalProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");

  async function handleSave() {
    setStatus("loading");
    await onSave(email);
    setStatus("done");
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="w-full max-w-md p-8 rounded-2xl border border-white/10 bg-obsidian"
            style={{ boxShadow: "0 0 60px rgba(59,130,246,0.1)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {status === "done" ? (
              <div className="text-center">
                <div className="text-4xl mb-4">✅</div>
                <h2 className="font-syne font-bold text-xl mb-2">Resume link sent!</h2>
                <p className="font-inter text-sm text-text-muted">Check your email. The link is valid for 30 days.</p>
                <button
                  onClick={onClose}
                  className="mt-6 px-6 py-2 rounded-lg border border-white/10 font-inter text-sm hover:border-white/20 transition-colors"
                >
                  Close
                </button>
              </div>
            ) : (
              <>
                <h2 className="font-syne font-bold text-xl mb-2">Save Your Progress</h2>
                <p className="font-inter text-sm text-text-muted mb-6">
                  We'll email you a link to pick up right where you left off. No account needed.
                </p>
                <input
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-white/4 border border-white/10 font-inter text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-electric-blue/50 mb-4"
                />
                <button
                  onClick={handleSave}
                  disabled={!email || status === "loading"}
                  className="w-full py-3 rounded-xl font-syne font-semibold text-sm text-white disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #3b82f6, #06b6d4)" }}
                >
                  {status === "loading" ? "Sending..." : "Send Resume Link →"}
                </button>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

**Step 7: Commit**

```bash
git add -A
git commit -m "feat: add form UI components (layout, progress, step card, fields, save modal)"
```

---

## Task 14: Questionnaire — Page Routes

**Files:**
- Create: `app/start/page.tsx`
- Create: `app/q/[token]/page.tsx`
- Create: `components/form/FormShell.tsx`
- Create: `app/success/page.tsx`

**Step 1: Create `components/form/FormShell.tsx`**

This is the main stateful form orchestrator used by both `/start` and `/q/[token]`.

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFormSession } from "@/lib/use-form-session";
import { FORM_STEPS } from "@/lib/form-steps";
import { FormLayout } from "./FormLayout";
import { StepCard } from "./StepCard";
import { QuestionField } from "./QuestionField";
import { SaveModal } from "./SaveModal";

interface FormShellProps {
  initialToken?: string;
}

export function FormShell({ initialToken }: FormShellProps) {
  const router = useRouter();
  const session = useFormSession(initialToken);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [direction, setDirection] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  const step = FORM_STEPS[session.currentStep - 1];

  async function handleNext() {
    if (session.currentStep === 12) {
      setSubmitting(true);
      const token = await session.saveToServer();
      await fetch(`/api/form/${token}/submit`, { method: "POST" });
      router.push("/success");
      return;
    }
    setDirection(1);
    await session.nextStep();
    window.scrollTo(0, 0);
  }

  function handleBack() {
    setDirection(-1);
    session.prevStep();
    window.scrollTo(0, 0);
  }

  async function handleSaveEmail(email: string) {
    const token = await session.saveToServer();
    await fetch(`/api/form/${token}/save-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
  }

  if (session.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="font-mono text-sm text-text-muted">Loading your session...</div>
      </div>
    );
  }

  return (
    <FormLayout
      currentStep={session.currentStep}
      totalSteps={12}
      onSave={() => setSaveModalOpen(true)}
    >
      <StepCard
        key={session.currentStep}
        stepKey={session.currentStep}
        icon={step.icon}
        title={step.title}
        subtitle={step.subtitle}
        direction={direction}
      >
        {step.questions.map((q) => (
          <QuestionField
            key={q.id}
            question={q}
            value={session.formData[q.id]}
            onChange={(val) => session.updateField(q.id, val)}
          />
        ))}

        {/* Navigation */}
        <div className="flex items-center justify-between pt-6 mt-6 border-t border-white/8">
          <button
            onClick={handleBack}
            disabled={session.currentStep === 1}
            className="px-5 py-2.5 rounded-xl font-inter text-sm border border-white/10 text-text-muted hover:text-text-primary hover:border-white/20 disabled:opacity-30 transition-all"
          >
            ← Back
          </button>
          <button
            onClick={handleNext}
            disabled={submitting}
            className="px-6 py-2.5 rounded-xl font-syne font-semibold text-sm text-white disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #3b82f6, #06b6d4)" }}
          >
            {submitting ? "Submitting..." : session.currentStep === 12 ? "Submit →" : "Continue →"}
          </button>
        </div>
      </StepCard>

      <SaveModal
        isOpen={saveModalOpen}
        token={session.token}
        onClose={() => setSaveModalOpen(false)}
        onSave={handleSaveEmail}
      />
    </FormLayout>
  );
}
```

**Step 2: Create `app/start/page.tsx`**

```typescript
import { FormShell } from "@/components/form/FormShell";

export default function StartPage() {
  return <FormShell />;
}
```

**Step 3: Create `app/q/[token]/page.tsx`**

```typescript
import { FormShell } from "@/components/form/FormShell";

interface Props {
  params: Promise<{ token: string }>;
}

export default async function ResumePage({ params }: Props) {
  const { token } = await params;
  return <FormShell initialToken={token} />;
}
```

**Step 4: Create `app/success/page.tsx`**

```typescript
"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { AnimatedBackground } from "@/components/ui/AnimatedBackground";

export default function SuccessPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <AnimatedBackground />
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="max-w-lg w-full text-center p-12 rounded-2xl border border-white/8 bg-white/2"
        style={{ boxShadow: "0 0 80px rgba(59,130,246,0.1)" }}
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: "spring" }}
          className="text-6xl mb-6"
        >
          🎉
        </motion.div>
        <h1 className="font-syne font-extrabold text-4xl mb-4">
          You're all set!
        </h1>
        <p className="font-inter text-text-muted mb-3 leading-relaxed">
          We've received your questionnaire and you'll receive a confirmation email with your DNS instructions shortly.
        </p>
        <p className="font-inter text-text-muted mb-8">
          We'll be in touch within <strong className="text-text-primary">1 business day</strong>.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-syne font-semibold text-sm text-white"
          style={{ background: "linear-gradient(135deg, #3b82f6, #06b6d4)" }}
        >
          Back to Home
        </Link>
      </motion.div>
    </div>
  );
}
```

**Step 5: Test the full form flow**

```bash
npm run dev
```

1. Visit http://localhost:3000/start
2. Fill out step 1 and click Continue
3. Go back and forward several times
4. Click "Save & Resume Later", enter email, verify modal flow
5. Visit http://localhost:3000/success

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: add questionnaire pages (start, resume, success)"
```

---

## Task 15: File Upload Integration

**Files:**
- Modify: `components/form/QuestionField.tsx`
- Create: `app/api/upload/route.ts`

**Step 1: Create `app/api/upload/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File;
  const token = formData.get("token") as string;

  if (!file || !token) {
    return NextResponse.json({ error: "Missing file or token" }, { status: 400 });
  }

  const supabase = createServerClient();
  const ext = file.name.split(".").pop();
  const path = `${token}/${Date.now()}-${file.name}`;

  const { data, error } = await supabase.storage
    .from("form-uploads")
    .upload(path, file, { contentType: file.type });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: urlData } = supabase.storage.from("form-uploads").getPublicUrl(data.path);

  // Append URL to session file_urls
  const { data: session } = await supabase
    .from("form_sessions")
    .select("file_urls")
    .eq("token", token)
    .single();

  const existing = (session?.file_urls as string[]) || [];
  await supabase
    .from("form_sessions")
    .update({ file_urls: [...existing, urlData.publicUrl] })
    .eq("token", token);

  return NextResponse.json({ url: urlData.publicUrl });
}
```

**Step 2: Update file upload in `QuestionField.tsx`**

Replace the `case "file":` block with:

```typescript
case "file":
  return (
    <div>
      <label className="block font-inter text-sm font-medium mb-2">{question.label}</label>
      <label className="relative block border-2 border-dashed border-white/10 rounded-xl p-8 text-center hover:border-electric-blue/30 transition-colors cursor-pointer">
        <p className="font-mono text-xs text-text-muted">Click to upload or drag & drop</p>
        <p className="font-mono text-xs text-text-muted/50 mt-1">PNG, JPG, PDF, AI, SVG, MP4 accepted</p>
        {strVal && (
          <p className="font-mono text-xs text-electric-blue mt-2">✓ {strVal}</p>
        )}
        <input
          type="file"
          multiple
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          onChange={async (e) => {
            const files = Array.from(e.target.files || []);
            const token = localStorage.getItem("om_form_session")
              ? JSON.parse(localStorage.getItem("om_form_session")!).token
              : null;
            if (!token) return;

            for (const file of files) {
              const fd = new FormData();
              fd.append("file", file);
              fd.append("token", token);
              await fetch("/api/upload", { method: "POST", body: fd });
            }
            onChange(files.map((f) => f.name).join(", "));
          }}
        />
      </label>
    </div>
  );
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: add file upload to Supabase Storage"
```

---

## Task 16: Final Polish & Expired Session Handling

**Files:**
- Modify: `app/q/[token]/page.tsx`
- Create: `app/q/[token]/expired/page.tsx`

**Step 1: Update `app/q/[token]/page.tsx` to handle expired tokens**

```typescript
import { createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { FormShell } from "@/components/form/FormShell";

interface Props {
  params: Promise<{ token: string }>;
}

export default async function ResumePage({ params }: Props) {
  const { token } = await params;
  const supabase = createServerClient();

  const { data } = await supabase
    .from("form_sessions")
    .select("expires_at, submitted_at")
    .eq("token", token)
    .single();

  if (!data || new Date(data.expires_at) < new Date()) {
    redirect(`/q/${token}/expired`);
  }

  if (data.submitted_at) {
    redirect("/success");
  }

  return <FormShell initialToken={token} />;
}
```

**Step 2: Create `app/q/[token]/expired/page.tsx`**

```typescript
"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { AnimatedBackground } from "@/components/ui/AnimatedBackground";

export default function ExpiredPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <AnimatedBackground />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full text-center p-12 rounded-2xl border border-white/8 bg-white/2"
      >
        <div className="text-5xl mb-6">⏰</div>
        <h1 className="font-syne font-extrabold text-3xl mb-4">Link Expired</h1>
        <p className="font-inter text-text-muted mb-8">
          This resume link has expired (links last 30 days). You can start a fresh questionnaire — it only takes about 20 minutes.
        </p>
        <Link
          href="/start"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-syne font-semibold text-sm text-white"
          style={{ background: "linear-gradient(135deg, #3b82f6, #06b6d4)" }}
        >
          Start Fresh →
        </Link>
      </motion.div>
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: add expired session handling and redirect"
```

---

## Task 17: Deploy to Vercel

**Step 1: Push to GitHub**

```bash
git push origin feat/claim-your-site-funnel
```

**Step 2: Create Vercel project**

```bash
npx vercel --prod
```

Follow the prompts to link to your Vercel account.

**Step 3: Set environment variables in Vercel**

In the Vercel dashboard → Project → Settings → Environment Variables, add:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `AGENCY_EMAIL`
- `AGENCY_IP_ADDRESS`
- `NEXT_PUBLIC_BASE_URL` = your Vercel URL (e.g. `https://your-project.vercel.app`)

**Step 4: Redeploy with env vars**

```bash
npx vercel --prod
```

**Step 5: Verify**

1. Visit production URL → landing page renders
2. Click "Start Your Project" → questionnaire starts
3. Fill step 1 and save email → check email for resume link
4. Visit resume link → picks up where left off
5. Complete form → check agency email + client email

**Step 6: Final commit**

```bash
git add -A
git commit -m "feat: production deployment configuration"
```

---

## Summary of All Files Created

```
app/
  page.tsx                          # Landing page
  layout.tsx                        # Root layout with fonts
  globals.css                       # Design tokens + utilities
  start/page.tsx                    # Begin questionnaire
  q/[token]/page.tsx                # Resume questionnaire
  q/[token]/expired/page.tsx        # Expired link page
  success/page.tsx                  # Submission success
  api/form/start/route.ts           # Create session
  api/form/[token]/route.ts         # Get/update session
  api/form/[token]/save-email/route.ts
  api/form/[token]/submit/route.ts
  api/upload/route.ts               # File uploads

components/
  ui/
    AnimatedBackground.tsx
    GlowOrbs.tsx
    GlowButton.tsx
    BrowserMockup.tsx
  landing/
    Navbar.tsx
    Hero.tsx
    Portfolio.tsx
    Process.tsx
    FinalCTA.tsx
    Footer.tsx
  form/
    FormLayout.tsx
    ProgressBar.tsx
    StepCard.tsx
    QuestionField.tsx
    DnsSelector.tsx
    SaveModal.tsx
    FormShell.tsx

lib/
  supabase/client.ts
  supabase/server.ts
  supabase/types.ts
  portfolio.ts
  form-steps.ts
  use-form-session.ts
  dns-instructions.ts

scripts/
  capture-screenshots.mjs

supabase/
  migrations/001_form_sessions.sql

public/
  portfolio/
    site-1.png ... clubhouse-cards.png (7 files)
```

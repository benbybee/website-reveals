# Automated Website Generation Pipeline

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When a form is submitted, automatically build a WordPress site using Claude Code CLI on a self-hosted VPS via Trigger.dev — including GitHub repo creation, site generation, and Cloudways deployment.

**Architecture:** Form submitted → emails sent → build job queued in Supabase → Trigger.dev task fires on VPS → Claude Code CLI (authenticated via `claude login`) runs with a per-form-type prompt → WordPress skill builds + deploys site → `gh` creates repo + commits code → build job updated with repo URL + site URL.

**Tech Stack:** Next.js 16, Supabase (raw SQL), Trigger.dev v3 (self-hosted worker), Claude Code CLI, GitHub CLI (`gh`), WordPress (Cloudways via MC Connector)

---

## Task 1: Supabase Migration — `build_jobs` Table

**Files:**
- Create: `supabase/migrations/004_build_jobs.sql`

**Step 1: Write the migration**

```sql
-- Build jobs table for automated website generation
CREATE TABLE build_jobs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token       uuid NOT NULL REFERENCES form_sessions(token) ON DELETE CASCADE,
  form_type   text NOT NULL,                          -- quick | standard | in-depth | novalux | future types
  status      text NOT NULL DEFAULT 'queued',         -- queued | building | deployed | failed
  repo_url    text,                                   -- GitHub repo URL once created
  site_url    text,                                   -- Live site URL once deployed
  error       text,                                   -- Error message if failed
  started_at  timestamp with time zone,
  completed_at timestamp with time zone,
  created_at  timestamp with time zone NOT NULL DEFAULT now()
);

-- Index for token lookups (join with form_sessions)
CREATE INDEX build_jobs_token_idx ON build_jobs(token);

-- Index for status polling (worker picks up queued jobs)
CREATE INDEX build_jobs_status_idx ON build_jobs(status);

-- RLS
ALTER TABLE build_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on build_jobs"
  ON build_jobs FOR ALL
  USING (true)
  WITH CHECK (true);
```

**Step 2: Run the migration**

Run in Supabase dashboard SQL editor or via CLI:
```bash
supabase db push
```

**Step 3: Commit**

```bash
git add supabase/migrations/004_build_jobs.sql
git commit -m "feat: add build_jobs table for automated site generation"
```

---

## Task 2: Form Type Resolver

**Files:**
- Create: `lib/resolve-form-type.ts`

**Step 1: Write the resolver**

This function takes a `form_sessions` row and returns the canonical form type string used to look up prompt templates.

```typescript
export type FormType = "quick" | "standard" | "in-depth" | "novalux" | "new-client";

/**
 * Derive the canonical form type from a form session's data.
 * Regular forms store _mode in formData. Custom forms store _source.
 * Future form types should add their _source value here.
 */
export function resolveFormType(
  formData: Record<string, unknown>,
): FormType {
  const source = formData._source as string | undefined;

  // Custom form sources take priority
  if (source === "novalux") return "novalux";
  if (source === "new-client") return "new-client";

  // Fall back to mode (quick/standard/in-depth)
  const mode = formData._mode as string | undefined;
  if (mode === "quick") return "quick";
  if (mode === "standard") return "standard";

  // Default to in-depth (the full 11-step form has no _mode set)
  return "in-depth";
}
```

**Step 2: Commit**

```bash
git add lib/resolve-form-type.ts
git commit -m "feat: add form type resolver for prompt template lookup"
```

---

## Task 3: Prompt Template System

**Files:**
- Create: `lib/prompts/base.ts`
- Create: `lib/prompts/quick.ts`
- Create: `lib/prompts/standard.ts`
- Create: `lib/prompts/in-depth.ts`
- Create: `lib/prompts/novalux.ts`
- Create: `lib/prompts/new-client.ts`
- Create: `lib/prompts/index.ts`

Each prompt template is a function that receives the formatted client brief (markdown) and returns the full Claude Code prompt. Adding a new form type = adding a new file + registering it in `index.ts`.

### Step 1: Write the base prompt builder

`lib/prompts/base.ts` — shared logic for formatting form data and common instructions.

```typescript
import { FORM_STEPS, QUICK_STEPS, STANDARD_STEPS, type FormStep } from "@/lib/form-steps";

/**
 * Format form data into a readable markdown brief using question labels.
 */
export function formatBrief(
  formData: Record<string, unknown>,
  steps: FormStep[],
): string {
  const lines: string[] = [];

  for (const step of steps) {
    const answered = step.questions.filter((q) => {
      const val = formData[q.id];
      return val !== undefined && val !== null && val !== "";
    });
    if (answered.length === 0) continue;

    lines.push(`### ${step.title}`);
    for (const q of answered) {
      const val = formData[q.id];
      const display = Array.isArray(val) ? (val as string[]).join(", ") : String(val);
      lines.push(`**${q.label}**`);
      lines.push(display);
      lines.push("");
    }
  }

  return lines.join("\n");
}

export function getStepsForFormType(formType: string): FormStep[] {
  if (formType === "quick") return QUICK_STEPS;
  if (formType === "standard") return STANDARD_STEPS;
  // in-depth and custom types use the full steps
  return FORM_STEPS;
}

/**
 * Shared instructions appended to every prompt.
 */
export const SHARED_INSTRUCTIONS = `
## Workflow

1. **Create GitHub repo:**
   \`\`\`bash
   gh repo create Website-Reveals/<SLUG> --private --clone
   cd <SLUG>
   \`\`\`
   Use the business name to derive a URL-friendly slug (lowercase, hyphens, no special chars).

2. **Build the site using the /wordpress-site-builder skill.**
   - Skip the discovery/questionnaire phase — all client information is in the brief below.
   - Follow the skill's full pipeline: design → HTML mockup → deploy to Cloudways.
   - Use automated Cloudways provisioning (clone from template).

3. **Commit all generated files to the repo and push:**
   \`\`\`bash
   git add -A
   git commit -m "feat: initial site build for <BUSINESS_NAME>"
   git push -u origin main
   \`\`\`

4. **When complete, output these exact lines (the system parses them):**
   \`\`\`
   BUILD_RESULT_REPO_URL: https://github.com/Website-Reveals/<SLUG>
   BUILD_RESULT_SITE_URL: <live Cloudways URL or custom domain>
   \`\`\`

## Important
- Use the client brief below as your ONLY source of requirements. Do not ask for clarification.
- If information is missing, make reasonable professional decisions.
- The site must be fully deployed and live when you're done.
`;
```

### Step 2: Write the Quick prompt

`lib/prompts/quick.ts`

```typescript
import { formatBrief, getStepsForFormType, SHARED_INSTRUCTIONS } from "./base";

export function buildQuickPrompt(formData: Record<string, unknown>): string {
  const brief = formatBrief(formData, getStepsForFormType("quick"));
  const businessName = (formData.business_name as string) || "Client";

  return `You are building a WordPress website for "${businessName}".

## Mode: Quick Build
This client provided minimal information via a quick intake form.
Fill in reasonable defaults for anything not specified:
- Create a focused site: Home (with hero, services overview, CTA), About, Contact.
- Use a clean, professional design that fits their industry.
- Generate compelling copy based on the business type and services listed.
- Keep it simple — this client values speed over exhaustive detail.
${SHARED_INSTRUCTIONS}
## Client Brief

${brief}`;
}
```

### Step 3: Write the Standard prompt

`lib/prompts/standard.ts`

```typescript
import { formatBrief, getStepsForFormType, SHARED_INSTRUCTIONS } from "./base";

export function buildStandardPrompt(formData: Record<string, unknown>): string {
  const brief = formatBrief(formData, getStepsForFormType("standard"));
  const businessName = (formData.business_name as string) || "Client";

  return `You are building a WordPress website for "${businessName}".

## Mode: Standard Build
This client provided solid detail across business info, goals, audience, brand, and services.
Build a comprehensive site:
- Pages: Home, About, individual Service pages, Contact, plus any others their goals suggest.
- Use their brand colors, personality descriptors, and look/feel preferences.
- Write copy that speaks directly to their target audience and addresses objections.
- Feature their differentiators and trust builders prominently.
- Include testimonials and FAQ sections if they provided that content.
${SHARED_INSTRUCTIONS}
## Client Brief

${brief}`;
}
```

### Step 4: Write the In-Depth prompt

`lib/prompts/in-depth.ts`

```typescript
import { formatBrief, getStepsForFormType, SHARED_INSTRUCTIONS } from "./base";

export function buildInDepthPrompt(formData: Record<string, unknown>): string {
  const brief = formatBrief(formData, getStepsForFormType("in-depth"));
  const businessName = (formData.business_name as string) || "Client";

  return `You are building a WordPress website for "${businessName}".

## Mode: In-Depth Premium Build
This client completed the full 11-step questionnaire with extensive detail.
Build a premium, highly tailored site:
- Full page structure based on their specifications (see "Pages and Navigation" section).
- Deep competitive positioning woven into all copy.
- Address every FAQ and objection they listed — turn them into conversion-driving content.
- Reference sites they admire should inform visual direction.
- Brand personality, "do not" lists, and messaging preferences must be strictly followed.
- Include problem/solution framing from their customer insights.
- Blog templates if they requested blog content.
${SHARED_INSTRUCTIONS}
## Client Brief

${brief}`;
}
```

### Step 5: Write the Novalux prompt

`lib/prompts/novalux.ts`

```typescript
import { SHARED_INSTRUCTIONS } from "./base";

/**
 * Novalux has a custom single-page form with fewer fields.
 * The brief is built manually since it doesn't use FORM_STEPS.
 */
export function buildNovaluxPrompt(formData: Record<string, unknown>): string {
  const fd = formData as Record<string, string | undefined>;
  const businessName = fd.business_name || "Client";

  const brief = [
    `### Business Details`,
    fd.business_name ? `**Business Name:** ${fd.business_name}` : "",
    fd.contact_person ? `**Primary Contact:** ${fd.contact_person}` : "",
    fd.email ? `**Email:** ${fd.email}` : "",
    fd.phone ? `**Phone:** ${fd.phone}` : "",
    fd.address ? `**Address:** ${fd.address}` : "",
    "",
    `### Service Area`,
    fd.service_areas || "Not specified",
    "",
    `### Domain`,
    fd.domain_name ? `**Domain:** ${fd.domain_name}` : "No domain specified",
    fd.dns_provider ? `**DNS Provider:** ${fd.dns_provider}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return `You are building a WordPress website for "${businessName}".

## Mode: NovaLux Client
This is a NovaLux partner client. NovaLux-specific requirements:
- TODO: Add NovaLux-specific design requirements here.
- TODO: Add NovaLux-specific page structure here.
- TODO: Add NovaLux brand guidelines reference here.

Replace the TODOs above with the actual NovaLux requirements before going live.
${SHARED_INSTRUCTIONS}
## Client Brief

${brief}`;
}
```

### Step 6: Write the New Client prompt

`lib/prompts/new-client.ts`

```typescript
import { SHARED_INSTRUCTIONS } from "./base";

/**
 * New Client quick intake — minimal fields: business name, current URL, details.
 * Claude Code must scrape the existing site to understand the business.
 */
export function buildNewClientPrompt(formData: Record<string, unknown>): string {
  const fd = formData as Record<string, string | undefined>;
  const businessName = fd.business_name || "Client";

  const brief = [
    `### Business Details`,
    fd.business_name ? `**Business Name:** ${fd.business_name}` : "",
    fd.current_url ? `**Current Website:** ${fd.current_url}` : "",
    "",
    `### Additional Context`,
    fd.details || "No additional details provided.",
  ]
    .filter(Boolean)
    .join("\n");

  return `You are building a WordPress website for "${businessName}".

## Mode: New Client (Minimal Intake)
This client submitted a quick intake form with only their business name, current website URL, and optional notes.
You have very little information — here's how to handle it:

1. **Scrape their existing website** at the URL provided to understand:
   - What industry/niche they're in
   - What services or products they offer
   - Their brand colors, tone, and visual style
   - Their contact info, service areas, and any testimonials
   - Their current page structure

2. **Use what you learn to build a significantly better version** of their site:
   - Modern, conversion-focused design
   - Clear service pages with compelling copy
   - Strong CTAs and contact integration
   - Professional layout that outperforms their current site

3. If no current URL is provided or the site is unreachable, build a clean professional site based on the business name and any details provided.
${SHARED_INSTRUCTIONS}
## Client Brief

${brief}`;
}
```

### Step 7: Write the prompt registry

> **Note:** Steps renumbered to accommodate new-client prompt.

`lib/prompts/index.ts`

```typescript
import type { FormType } from "@/lib/resolve-form-type";
import { buildQuickPrompt } from "./quick";
import { buildStandardPrompt } from "./standard";
import { buildInDepthPrompt } from "./in-depth";
import { buildNovaluxPrompt } from "./novalux";
import { buildNewClientPrompt } from "./new-client";

type PromptBuilder = (formData: Record<string, unknown>) => string;

/**
 * Registry of prompt builders keyed by form type.
 * To add a new form type:
 *   1. Create lib/prompts/<type>.ts with a buildXxxPrompt function
 *   2. Add it to this map
 */
const PROMPT_BUILDERS: Record<FormType, PromptBuilder> = {
  quick: buildQuickPrompt,
  standard: buildStandardPrompt,
  "in-depth": buildInDepthPrompt,
  novalux: buildNovaluxPrompt,
  "new-client": buildNewClientPrompt,
};

export function buildPrompt(
  formType: FormType,
  formData: Record<string, unknown>,
): string {
  const builder = PROMPT_BUILDERS[formType];
  if (!builder) {
    throw new Error(`No prompt template for form type: ${formType}`);
  }
  return builder(formData);
}
```

### Step 7: Commit

```bash
git add lib/resolve-form-type.ts lib/prompts/
git commit -m "feat: add per-form-type prompt template system"
```

---

## Task 4: Install Trigger.dev

**Files:**
- Create: `trigger.config.ts`
- Modify: `package.json` (dependencies added by install)

### Step 1: Install Trigger.dev SDK

```bash
npm install @trigger.dev/sdk
```

### Step 2: Create trigger config

`trigger.config.ts`

```typescript
import { defineConfig } from "@trigger.dev/sdk/v3";

export default defineConfig({
  project: "website-reveals",        // Replace with actual Trigger.dev project ref
  runtime: "node",
  logLevel: "log",
  dirs: ["src/trigger"],
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 1,                 // Don't retry builds — they're expensive
    },
  },
});
```

### Step 3: Create trigger task directory

```bash
mkdir -p src/trigger
```

### Step 4: Commit

```bash
git add trigger.config.ts package.json package-lock.json
git commit -m "feat: add Trigger.dev project configuration"
```

---

## Task 5: Trigger.dev Build Website Task

**Files:**
- Create: `src/trigger/build-website.ts`

This task runs on the self-hosted VPS worker. It:
1. Updates build job status to `building`
2. Creates a GitHub repo via `gh` CLI
3. Runs Claude Code CLI with the prompt
4. Parses output for repo URL and site URL
5. Updates build job status to `deployed` or `failed`

### Step 1: Write the task

```typescript
import { task } from "@trigger.dev/sdk/v3";
import { createClient } from "@supabase/supabase-js";
import { spawn } from "child_process";
import { mkdtemp, writeFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export const buildWebsite = task({
  id: "build-website",
  // Claude Code builds can take 10-30+ minutes
  maxDuration: 1800,
  run: async (payload: {
    buildJobId: string;
    token: string;
    formType: string;
    prompt: string;
  }) => {
    const { buildJobId, token, formType, prompt } = payload;

    // Mark as building
    await supabase
      .from("build_jobs")
      .update({ status: "building", started_at: new Date().toISOString() })
      .eq("id", buildJobId);

    let workDir: string | null = null;

    try {
      // Create temp working directory
      workDir = await mkdtemp(join(tmpdir(), `build-${token}-`));

      // Write prompt to a file (avoids shell escaping issues with long prompts)
      const promptPath = join(workDir, "PROMPT.md");
      await writeFile(promptPath, prompt, "utf-8");

      // Run Claude Code CLI
      const output = await runClaudeCode(promptPath, workDir);

      // Parse results from Claude Code output
      const repoUrl = extractResult(output, "BUILD_RESULT_REPO_URL");
      const siteUrl = extractResult(output, "BUILD_RESULT_SITE_URL");

      // Mark as deployed
      await supabase
        .from("build_jobs")
        .update({
          status: "deployed",
          repo_url: repoUrl,
          site_url: siteUrl,
          completed_at: new Date().toISOString(),
        })
        .eq("id", buildJobId);

      return { status: "deployed", repoUrl, siteUrl };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);

      await supabase
        .from("build_jobs")
        .update({
          status: "failed",
          error: errorMsg.slice(0, 2000),
          completed_at: new Date().toISOString(),
        })
        .eq("id", buildJobId);

      throw err;
    } finally {
      // Clean up temp directory (repo was pushed to GitHub, local copy not needed)
      if (workDir) {
        await rm(workDir, { recursive: true, force: true }).catch(() => {});
      }
    }
  },
});

/**
 * Spawn Claude Code CLI in headless mode.
 * Requires `claude` to be installed and authenticated on the VPS.
 */
function runClaudeCode(promptPath: string, cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];

    const child = spawn(
      "claude",
      [
        "-p",                            // Print mode (non-interactive)
        "--input-file", promptPath,      // Read prompt from file
        "--dangerously-skip-permissions", // No confirmation prompts
        "--output-format", "text",       // Plain text output
        "--max-turns", "100",            // Allow many agentic turns
        "--verbose",
      ],
      { cwd, stdio: ["ignore", "pipe", "pipe"] },
    );

    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => errChunks.push(chunk));

    child.on("close", (code) => {
      const stdout = Buffer.concat(chunks).toString("utf-8");
      const stderr = Buffer.concat(errChunks).toString("utf-8");

      if (code !== 0) {
        reject(new Error(`Claude Code exited with code ${code}:\n${stderr}\n${stdout}`));
      } else {
        resolve(stdout);
      }
    });

    child.on("error", (err) => {
      reject(new Error(`Failed to spawn Claude Code: ${err.message}`));
    });
  });
}

/**
 * Extract a BUILD_RESULT_* value from Claude Code output.
 */
function extractResult(output: string, key: string): string | null {
  const regex = new RegExp(`^${key}:\\s*(.+)$`, "m");
  const match = output.match(regex);
  return match ? match[1].trim() : null;
}
```

### Step 2: Commit

```bash
git add src/trigger/build-website.ts
git commit -m "feat: add Trigger.dev task for automated website builds"
```

---

## Task 6: Hook Submit Handler

**Files:**
- Modify: `app/api/form/[token]/submit/route.ts`

Add build job creation + Trigger.dev task dispatch after emails are sent.

### Step 1: Update the submit route

Add these imports at the top of `app/api/form/[token]/submit/route.ts`:

```typescript
import { tasks } from "@trigger.dev/sdk/v3";
import { resolveFormType } from "@/lib/resolve-form-type";
import { buildPrompt } from "@/lib/prompts";
```

Then add the following block after the agency email block (after the `if (process.env.AGENCY_EMAIL)` block closes), before the `return NextResponse.json({ ok: true })`:

```typescript
  // ── Queue automated website build ──────────────────────────
  try {
    const formType = resolveFormType(formData);
    const prompt = buildPrompt(formType, formData);

    // Create build job
    const { data: buildJob } = await supabase
      .from("build_jobs")
      .insert({ token, form_type: formType })
      .select("id")
      .single();

    if (buildJob) {
      // Fire Trigger.dev task (non-blocking)
      await tasks.trigger("build-website", {
        buildJobId: buildJob.id,
        token,
        formType,
        prompt,
      });
    }
  } catch (buildErr) {
    // Log but don't fail the submission — emails already sent
    console.error("Failed to queue build job:", buildErr);
  }
```

### Step 2: Verify the full file compiles

```bash
npx tsc --noEmit
```

### Step 3: Commit

```bash
git add app/api/form/\[token\]/submit/route.ts
git commit -m "feat: queue automated build on form submission"
```

---

## Task 7: Build Status API

**Files:**
- Create: `app/api/builds/[token]/route.ts`

Provides build status for the admin dashboard or future client-facing status page.

### Step 1: Write the route

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("build_jobs")
    .select("id, form_type, status, repo_url, site_url, error, started_at, completed_at, created_at")
    .eq("token", token)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "No build found" }, { status: 404 });
  }

  return NextResponse.json(data);
}
```

### Step 2: Commit

```bash
git add app/api/builds/\[token\]/route.ts
git commit -m "feat: add build status API endpoint"
```

---

## Task 8: Environment Variables

**Files:**
- Modify: `.env.local` (add Trigger.dev vars)

### Step 1: Add required env vars

Add to `.env.local`:
```
# Trigger.dev
TRIGGER_SECRET_KEY=tr_dev_xxx   # From Trigger.dev dashboard > Project > API Keys
```

The VPS worker also needs these env vars in its environment:
```
TRIGGER_SECRET_KEY=tr_dev_xxx
NEXT_PUBLIC_SUPABASE_URL=<same as app>
SUPABASE_SERVICE_ROLE_KEY=<same as app>
```

### Step 2: Update `.env.example` if it exists

Add the `TRIGGER_SECRET_KEY` placeholder.

### Step 3: Commit

```bash
git add .env.example
git commit -m "docs: add Trigger.dev env var placeholder"
```

---

## VPS Setup Reference (Not Part of This Plan)

For the self-hosted Trigger.dev worker on the VPS, you need:

1. **Node.js 20+** installed
2. **Claude Code CLI** installed and authenticated:
   ```bash
   npm install -g @anthropic-ai/claude-code
   claude login
   ```
3. **GitHub CLI** installed and authenticated:
   ```bash
   gh auth login
   ```
4. **Trigger.dev worker** deployed:
   ```bash
   npx trigger.dev@latest deploy --self-hosted
   # This builds a Docker image or deployable artifact
   # Run it on the VPS with the env vars above
   ```
5. **Cloudways API credentials** available (the WordPress skill reads from `cli/.env` in the WordPress project — ensure the VPS has access)
6. **WordPress skill** installed at `~/.claude/skills/wordpress-site-builder/`

---

## Adding a New Form Type (Future Reference)

To add a new form type (e.g., "premium-dental"):

1. Create the form component (like `NovaluxForm.tsx`)
2. Ensure it stores `_source: "premium-dental"` in `formData`
3. Add `"premium-dental"` to the `FormType` union in `lib/resolve-form-type.ts`
4. Add the resolver case in `resolveFormType()`
5. Create `lib/prompts/premium-dental.ts` with a `buildPremiumDentalPrompt()` function
6. Register it in `lib/prompts/index.ts`

That's it. No other files need to change.

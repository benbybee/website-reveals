# Template "Find Your Site" Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship a single-QR public lookup (`/join`) where a postcard recipient types business name + ZIP to reach their SL preview, and replace QR-scan tracking with per-prospect looked-up/clicked counters on the sales board.

**Architecture:** One additive Supabase migration promotes `preview_url`/`sl_build_id`/`zip` from `tpl_prospects.record` JSONB to indexed columns, adds a `pg_trgm` name index, lookup/click rollups, a `tpl_prospect_lookups` event log, and two SQL functions (`tpl_find_prospects` search, `tpl_record_lookup` recorder) — mirroring the existing `tpl_qr_scans` + `tpl_record_qr_scan` pattern. A public `/join` page calls `POST /api/templates/find` (DB trigram search via the function) and links matches to a tracked `/s/<id>` redirect that logs the click and 302s to the preview. The old `/r/` per-card system is left intact.

**Tech Stack:** Next.js 16 app router (server + client components, `force-dynamic`), Supabase Postgres (service-role `tplDb()`, RPC functions, `pg_trgm`), Vitest 3, Windows/PowerShell. Project path contains a space: `c:\Users\Ben Bybee\Desktop\Websites\Website Reveals`.

**Conventions to mirror (read these first):**
- Redirect + recorder: [app/r/[token]/route.ts](../../app/r/[token]/route.ts), [036_tpl_qr_scans.sql](../../supabase/migrations/036_tpl_qr_scans.sql)
- Config/db: `templatesEnabled()`, `tplDb()` in [lib/templates/config.ts](../../lib/templates/config.ts), [lib/templates/db.ts](../../lib/templates/db.ts)
- In-memory rate limit: [app/api/form/start/route.ts](../../app/api/form/start/route.ts)
- Sales board: [app/admin/templates/sales/page.tsx](../../app/admin/templates/sales/page.tsx), [components/admin/templates/SalesBoard.tsx](../../components/admin/templates/SalesBoard.tsx)
- QR/mail merge: [lib/templates/mail/qr.ts](../../lib/templates/mail/qr.ts), [lib/templates/mail/send.ts](../../lib/templates/mail/send.ts)
- Migration runner: `node scripts/apply-migration.mjs <file>` (reads `.env.local`/`.env.vercel.pulled`)

**Test runner note:** single-file vitest runs have been flaky on this machine (esbuild/OOM). Run the module suite: `npx vitest run lib/templates`. Type-check with `npx tsc --noEmit`.

---

## Task 1: Migration — promote columns, indexes, tracking table, functions, backfill

**Files:**
- Create: `supabase/migrations/042_tpl_find_lookup.sql`

**Step 1: Write the migration**

```sql
-- Template Site GTM v2: single-QR "Find Your Site" lookup + engagement tracking.
-- One static QR on every postcard points at /join; the recipient types business
-- name + ZIP to reach their preview. Identity comes from what they type (a shared
-- QR can't carry it), so we promote the match keys to indexed columns and track
-- looked-up/clicked per prospect (replacing the per-card scan signal on the board).
-- All additive + idempotent; record JSONB stays the SL-callback write target and
-- these columns are a queryable mirror. Nothing is moved or dropped.

-- 1. Promote match/target fields from record JSONB to indexed columns.
ALTER TABLE tpl_prospects
  ADD COLUMN IF NOT EXISTS preview_url  text,
  ADD COLUMN IF NOT EXISTS sl_build_id  text,
  ADD COLUMN IF NOT EXISTS zip          text,
  ADD COLUMN IF NOT EXISTS lookup_count      integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_looked_up_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS click_count       integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_clicked_at   timestamp with time zone;

-- 2. Backfill from existing JSONB. zip normalized to 5 digits so the exact-match
--    index path lines up with what the lookup form sends.
UPDATE tpl_prospects SET
  preview_url = COALESCE(preview_url, NULLIF(record->>'preview_url','')),
  sl_build_id = COALESCE(sl_build_id, NULLIF(record->>'sl_build_id','')),
  zip = COALESCE(zip, NULLIF(left(regexp_replace(COALESCE(record->'address'->>'zip',''), '\D', '', 'g'), 5), ''));

-- 3. Matching support: forgiving fuzzy name + exact zip.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS tpl_prospects_name_trgm_idx
  ON tpl_prospects USING gin (business_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS tpl_prospects_zip_idx
  ON tpl_prospects(zip) WHERE zip IS NOT NULL;
CREATE INDEX IF NOT EXISTS tpl_prospects_preview_idx
  ON tpl_prospects(id) WHERE preview_url IS NOT NULL;

-- 4. Append-only lookup/click event log (same shape as tpl_qr_scans).
CREATE TABLE IF NOT EXISTS tpl_prospect_lookups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES tpl_prospects(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES tpl_campaigns(id) ON DELETE SET NULL,
  kind        text NOT NULL CHECK (kind IN ('resolved','clicked')),
  ip          text,
  user_agent  text,
  at          timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tpl_prospect_lookups_prospect_idx ON tpl_prospect_lookups(prospect_id);
CREATE INDEX IF NOT EXISTS tpl_prospect_lookups_campaign_idx ON tpl_prospect_lookups(campaign_id);

ALTER TABLE tpl_prospect_lookups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on tpl_prospect_lookups"
  ON tpl_prospect_lookups FOR ALL USING (true) WITH CHECK (true);

-- 5. Search function: exact zip + trigram name, only lookup-eligible rows.
--    `%` uses pg_trgm's similarity threshold (default 0.3). Returns top matches
--    by similarity so the route can decide none/one/many.
CREATE OR REPLACE FUNCTION tpl_find_prospects(p_name text, p_zip text)
RETURNS TABLE (id uuid, business_name text, city text, state text, preview_url text, sim real)
LANGUAGE sql STABLE AS $$
  SELECT id, business_name, city, state, preview_url,
         similarity(business_name, p_name) AS sim
  FROM tpl_prospects
  WHERE preview_url IS NOT NULL
    AND zip = p_zip
    AND business_name % p_name
  ORDER BY sim DESC, business_name ASC
  LIMIT 10;
$$;

-- 6. Atomic recorder: append the event, bump the matching rollup, return the
--    prospect's preview_url (so the /s click redirect resolves in one round trip,
--    mirroring tpl_record_qr_scan). NULL if the prospect is gone.
CREATE OR REPLACE FUNCTION tpl_record_lookup(
  p_prospect_id uuid,
  p_kind        text,
  p_ip          text,
  p_user_agent  text
) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  pr RECORD;
BEGIN
  SELECT campaign_id, preview_url INTO pr FROM tpl_prospects WHERE id = p_prospect_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  INSERT INTO tpl_prospect_lookups (prospect_id, campaign_id, kind, ip, user_agent)
    VALUES (p_prospect_id, pr.campaign_id, p_kind, p_ip, p_user_agent);

  IF p_kind = 'resolved' THEN
    UPDATE tpl_prospects
      SET lookup_count = lookup_count + 1, last_looked_up_at = now()
      WHERE id = p_prospect_id;
  ELSIF p_kind = 'clicked' THEN
    UPDATE tpl_prospects
      SET click_count = click_count + 1, last_clicked_at = now()
      WHERE id = p_prospect_id;
  END IF;

  RETURN pr.preview_url;
END;
$$;
```

**Step 2: Apply to the database**

Run: `node scripts/apply-migration.mjs supabase/migrations/042_tpl_find_lookup.sql`
Expected: prints success / rows affected, no error.

**Step 3: Verify backfill + functions** (PowerShell, via the same runner pattern or psql). Sanity query:

```sql
SELECT count(*) AS total,
       count(preview_url) AS with_preview,
       count(zip) AS with_zip
FROM tpl_prospects;
-- with_preview/with_zip should match the count of rows whose record JSONB had them.
SELECT * FROM tpl_find_prospects('test', '00000'); -- expect 0 rows, no error.
```

Expected: query runs clean; promoted counts equal the JSONB-present counts.

**Step 4: Commit**

```bash
git add supabase/migrations/042_tpl_find_lookup.sql
git commit -m "feat(templates): migration for find-your-site lookup + tracking"
```

---

## Task 2: SL callback writes the promoted columns

Keep `record` JSONB authoritative AND mirror into the new columns so future builds populate them.

**Files:**
- Modify: [app/api/templates/sl-callback/route.ts](../../app/api/templates/sl-callback/route.ts) (the update near line 86)

**Step 1: Update the write**

Find the success update:

```ts
  const { error: updErr } = await supabase
    .from("tpl_prospects")
    .update({ stage, record, updated_at: new Date().toISOString() })
    .eq("source_id", key);
```

Replace with one that also sets the columns (only when present in this callback):

```ts
  const patch: Record<string, unknown> = { stage, record, updated_at: new Date().toISOString() };
  if (body.build_id) patch.sl_build_id = body.build_id;
  if (body.site_url) patch.preview_url = body.site_url;
  const { error: updErr } = await supabase
    .from("tpl_prospects")
    .update(patch)
    .eq("source_id", key);
```

**Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npx vitest run lib/templates`
Expected: all pass (no callback unit test exists; this guards the rest).

**Step 3: Commit**

```bash
git add app/api/templates/sl-callback/route.ts
git commit -m "feat(templates): SL callback mirrors preview_url/sl_build_id to columns"
```

---

## Task 3: Pure match helpers (TDD)

Unit-testable normalization + classification, kept out of the route so they can be tested without a DB.

**Files:**
- Create: `lib/templates/find/match.ts`
- Test: `lib/templates/find/match.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { normalizeZip, normalizeName, classifyMatches, type FindRow } from "./match";

const row = (id: string, name: string): FindRow => ({
  id, business_name: name, city: "Mesa", state: "AZ", preview_url: "https://x.pages.dev", sim: 0.9,
});

describe("normalizeZip", () => {
  it("keeps the first 5 digits", () => {
    expect(normalizeZip("85201")).toBe("85201");
    expect(normalizeZip("85201-1234")).toBe("85201");
    expect(normalizeZip(" 85201 ")).toBe("85201");
  });
  it("returns empty for non-5-digit input", () => {
    expect(normalizeZip("852")).toBe("");
    expect(normalizeZip("")).toBe("");
    expect(normalizeZip("abcde")).toBe("");
  });
});

describe("normalizeName", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeName("  Joe's   Pest  ")).toBe("Joe's Pest");
  });
  it("returns empty for blank", () => {
    expect(normalizeName("   ")).toBe("");
  });
});

describe("classifyMatches", () => {
  it("none when no rows", () => {
    expect(classifyMatches([]).kind).toBe("none");
  });
  it("one when a single row", () => {
    const r = classifyMatches([row("a", "Joe's Pest")]);
    expect(r.kind).toBe("one");
    if (r.kind === "one") expect(r.match.id).toBe("a");
  });
  it("many when multiple rows", () => {
    const r = classifyMatches([row("a", "Joe's Pest"), row("b", "Joe's Pest Co")]);
    expect(r.kind).toBe("many");
    if (r.kind === "many") expect(r.matches).toHaveLength(2);
  });
});
```

**Step 2: Run to verify it fails**

Run: `npx vitest run lib/templates/find` → Expected: FAIL (module not found).
(If single-file run OOMs, run `npx vitest run lib/templates` and look for the find failures.)

**Step 3: Implement**

```ts
// Pure, DB-free helpers for the /join lookup. The fuzzy SQL lives in
// tpl_find_prospects; here we only normalize inputs and shape the result.

export interface FindRow {
  id: string;
  business_name: string | null;
  city: string | null;
  state: string | null;
  preview_url: string | null;
  sim: number;
}

export type MatchResult =
  | { kind: "none" }
  | { kind: "one"; match: FindRow }
  | { kind: "many"; matches: FindRow[] };

/** First 5 digits, or "" if the input isn't a clean 5-digit US ZIP. */
export function normalizeZip(raw: string): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits.length >= 5 ? digits.slice(0, 5) : "";
}

/** Trimmed, single-spaced business name. */
export function normalizeName(raw: string): string {
  return (raw ?? "").trim().replace(/\s+/g, " ");
}

/** none / one / many from the search rows (already zip+name filtered by SQL). */
export function classifyMatches(rows: FindRow[]): MatchResult {
  if (rows.length === 0) return { kind: "none" };
  if (rows.length === 1) return { kind: "one", match: rows[0] };
  return { kind: "many", matches: rows };
}
```

**Step 4: Run to verify it passes**

Run: `npx vitest run lib/templates` → Expected: the `find/match.test.ts` block passes.

**Step 5: Commit**

```bash
git add lib/templates/find/match.ts lib/templates/find/match.test.ts
git commit -m "feat(templates): pure name+zip match helpers for /join lookup"
```

---

## Task 4: Resolve API — `POST /api/templates/find`

**Files:**
- Create: `app/api/templates/find/route.ts`

**Step 1: Implement**

```ts
import { NextRequest, NextResponse } from "next/server";
import { tplDb } from "@/lib/templates/db";
import { templatesEnabled } from "@/lib/templates/config";
import { normalizeName, normalizeZip, classifyMatches, type FindRow } from "@/lib/templates/find/match";

export const dynamic = "force-dynamic";

// Best-effort in-memory per-IP limit (mirrors app/api/form/start). Public,
// DB-touching endpoint hygiene — not a privacy control.
const HITS = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const e = HITS.get(ip);
  if (!e || now > e.resetAt) {
    HITS.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  e.count += 1;
  return e.count > MAX_PER_WINDOW;
}

export async function POST(req: NextRequest) {
  if (!templatesEnabled()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let body: { business_name?: string; zip?: string };
  try {
    body = (await req.json()) as { business_name?: string; zip?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const name = normalizeName(body.business_name ?? "");
  const zip = normalizeZip(body.zip ?? "");
  if (!name || !zip) {
    return NextResponse.json({ result: "none" });
  }

  const db = tplDb();
  const { data, error } = await db.rpc("tpl_find_prospects", { p_name: name, p_zip: zip });
  if (error) {
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }

  const result = classifyMatches((data ?? []) as FindRow[]);

  if (result.kind === "one") {
    // Found their business -> log the resolve, return the click target.
    await db.rpc("tpl_record_lookup", {
      p_prospect_id: result.match.id,
      p_kind: "resolved",
      p_ip: ip === "unknown" ? null : ip,
      p_user_agent: req.headers.get("user-agent"),
    });
    return NextResponse.json({
      result: "one",
      match: { id: result.match.id, business_name: result.match.business_name, city: result.match.city, state: result.match.state },
    });
  }
  if (result.kind === "many") {
    return NextResponse.json({
      result: "many",
      matches: result.matches.map((m) => ({ id: m.id, business_name: m.business_name, city: m.city, state: m.state })),
    });
  }
  return NextResponse.json({ result: "none" });
}
```

**Step 2: Verify**

Run: `npx tsc --noEmit` → Expected: exit 0.

**Step 3: Commit**

```bash
git add app/api/templates/find/route.ts
git commit -m "feat(templates): POST /api/templates/find resolver (name+zip)"
```

---

## Task 5: Tracked click redirect — `/s/[id]`

Mirrors [app/r/[token]/route.ts](../../app/r/[token]/route.ts): never a dead end, logs the click, 302s to the preview.

**Files:**
- Create: `app/s/[id]/route.ts`

**Step 1: Implement**

```ts
import { NextRequest, NextResponse } from "next/server";
import { tplDb } from "@/lib/templates/db";
import { qrBaseUrl } from "@/lib/templates/mail/qr";

// Public click redirect for the /join lookup. Logs a 'clicked' engagement event
// for the prospect, then 302s to their preview. Not behind templatesEnabled (a
// printed/shared link must keep working) and never throws for the visitor.
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let target = qrBaseUrl();

  try {
    const db = tplDb();
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
    const { data } = await db.rpc("tpl_record_lookup", {
      p_prospect_id: id,
      p_kind: "clicked",
      p_ip: ip,
      p_user_agent: req.headers.get("user-agent"),
    });
    if (typeof data === "string" && data.trim()) target = data;
  } catch {
    // Never break the redirect for a visitor.
  }

  return NextResponse.redirect(target, 302);
}
```

**Step 2: Verify**

Run: `npx tsc --noEmit` → Expected: exit 0.

**Step 3: Commit**

```bash
git add app/s/[id]/route.ts
git commit -m "feat(templates): tracked /s/<id> click redirect to preview"
```

---

## Task 6: Public `/join` page

Server page (gated) + a small client component for the form/results. Minimal result: business name + "Open your site →" → `/s/<id>`.

**Files:**
- Create: `app/join/page.tsx`
- Create: `components/templates/FindYourSite.tsx`

**Step 1: Server page**

```tsx
import { notFound } from "next/navigation";
import { templatesEnabled } from "@/lib/templates/config";
import { FindYourSite } from "@/components/templates/FindYourSite";

export const dynamic = "force-dynamic";
export const metadata = { title: "Find your website" };

export default function JoinPage() {
  if (!templatesEnabled()) notFound();
  return (
    <main style={{ minHeight: "100vh", background: "#faf9f5", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 460 }}>
        <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "1.75rem", fontWeight: 700, marginBottom: 8 }}>
          Find your website
        </h1>
        <p style={{ fontSize: 14, color: "#555553", marginBottom: 20 }}>
          Enter your business name and the ZIP code on your postcard to see the site we built for you.
        </p>
        <FindYourSite />
      </div>
    </main>
  );
}
```

**Step 2: Client component**

```tsx
"use client";

import { useState } from "react";

type Match = { id: string; business_name: string | null; city: string | null; state: string | null };
type FindResponse =
  | { result: "none" }
  | { result: "one"; match: Match }
  | { result: "many"; matches: Match[] };

export function FindYourSite() {
  const [name, setName] = useState("");
  const [zip, setZip] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const [res, setRes] = useState<FindResponse | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("loading");
    setRes(null);
    try {
      const r = await fetch("/api/templates/find", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ business_name: name, zip }),
      });
      setRes((await r.json()) as FindResponse);
    } catch {
      setRes({ result: "none" });
    } finally {
      setState("done");
    }
  }

  return (
    <div>
      <form onSubmit={submit} style={{ display: "grid", gap: 10 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Business name" required style={inp} />
        <input value={zip} onChange={(e) => setZip(e.target.value)} placeholder="ZIP code" inputMode="numeric" required style={inp} />
        <button type="submit" disabled={state === "loading"} style={btn}>
          {state === "loading" ? "Searching…" : "Find my site"}
        </button>
      </form>

      {state === "done" && res?.result === "one" && (
        <ResultCard match={res.match} />
      )}
      {state === "done" && res?.result === "many" && (
        <div style={{ marginTop: 18, display: "grid", gap: 8 }}>
          <p style={{ fontSize: 13, color: "#555553" }}>We found a few — pick yours:</p>
          {res.matches.map((m) => <ResultCard key={m.id} match={m} />)}
        </div>
      )}
      {state === "done" && res?.result === "none" && (
        <p style={{ marginTop: 18, fontSize: 14, color: "#8a2a1a" }}>
          We couldn&apos;t find it. Double-check the spelling and the ZIP code printed on your postcard.
        </p>
      )}
    </div>
  );
}

function ResultCard({ match }: { match: Match }) {
  return (
    <a
      href={`/s/${match.id}`}
      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14, padding: "14px 16px", background: "#fff", border: "1.5px solid #e8e6df", borderRadius: 8, textDecoration: "none", color: "#111110" }}
    >
      <span>
        <strong style={{ display: "block", fontSize: 15 }}>{match.business_name || "Your business"}</strong>
        <span style={{ fontSize: 12, color: "#888886" }}>{[match.city, match.state].filter(Boolean).join(", ")}</span>
      </span>
      <span style={{ fontWeight: 600, color: "#1a7a3a" }}>Open your site →</span>
    </a>
  );
}

const inp: React.CSSProperties = { width: "100%", padding: "11px 12px", border: "1.5px solid #d8d6cf", borderRadius: 6, fontSize: 15, boxSizing: "border-box" };
const btn: React.CSSProperties = { padding: "11px 12px", background: "#1a7a3a", color: "#fff", border: "none", borderRadius: 6, fontSize: 15, fontWeight: 600, cursor: "pointer" };
```

**Step 3: Verify**

Run: `npx tsc --noEmit` → Expected: exit 0.

**Step 4: Commit**

```bash
git add app/join/page.tsx components/templates/FindYourSite.tsx
git commit -m "feat(templates): public /join find-your-site page"
```

---

## Task 7: Sales board — swap scan → looked-up/clicked

**Files:**
- Modify: [app/admin/templates/sales/page.tsx](../../app/admin/templates/sales/page.tsx)
- Modify: [components/admin/templates/SalesBoard.tsx](../../components/admin/templates/SalesBoard.tsx)

**Step 1: page.tsx — select the new columns, drop the mailings scan aggregation**

In the `.select(...)` replace the `tpl_mailings(scan_count,last_scanned_at)` embed with the prospect columns:

```ts
    .select("id, business_name, city, state, phone, website, stage, agent_id, record, call_count, last_called_at, lookup_count, last_looked_up_at, click_count, last_clicked_at")
```

Replace the per-row mapping (the `mailings`/`scanCount`/`lastScannedAt` block) so the mapped object uses:

```ts
    return {
      id: p.id as string,
      business_name: (p.business_name as string) ?? null,
      city: (p.city as string) ?? null,
      state: (p.state as string) ?? null,
      phone: (p.phone as string) ?? null,
      website: (p.website as string) ?? null,
      stage: p.stage as string,
      agent_id: (p.agent_id as string) ?? null,
      preview_url: ((p.record as { preview_url?: string } | null)?.preview_url) ?? null,
      lookup_count: (p.lookup_count as number) ?? 0,
      last_looked_up_at: (p.last_looked_up_at as string) ?? null,
      click_count: (p.click_count as number) ?? 0,
      last_clicked_at: (p.last_clicked_at as string) ?? null,
      call_count: (p.call_count as number) ?? 0,
      last_called_at: (p.last_called_at as string) ?? null,
    };
```

**Step 2: SalesBoard.tsx — interface, column header, badge, sort toggle**

- In `SalesProspect`, replace `scan_count`/`last_scanned_at` with:
  ```ts
  lookup_count: number;
  last_looked_up_at: string | null;
  click_count: number;
  last_clicked_at: string | null;
  ```
- Rename the `scannedFirst` toggle to `engagedFirst` and sort by `click_count` then `last_clicked_at`:
  ```ts
  const visible = engagedFirst
    ? [...filtered].sort((a, b) => {
        if (b.click_count !== a.click_count) return b.click_count - a.click_count;
        return (b.last_clicked_at ?? "").localeCompare(a.last_clicked_at ?? "");
      })
    : filtered;
  ```
  Update the checkbox label to `Engaged first`.
- Replace the `<th ...>Scan</th>` with two narrow headers `Looked up` and `Opened` (or one combined — keep one column "Opened" + tooltip if you prefer minimal). Recommended: two cells.
  ```tsx
  <th style={{ ...th, width: 80 }}>Looked up</th>
  <th style={{ ...th, width: 70 }}>Opened</th>
  ```
- Replace the single `<ScanBadge .../>` cell with two cells:
  ```tsx
  <td style={{ ...td, textAlign: "center" }}><EngageBadge count={p.lookup_count} at={p.last_looked_up_at} glyph="🔍" tone="muted" title="Looked up" /></td>
  <td style={{ ...td, textAlign: "center" }}><EngageBadge count={p.click_count} at={p.last_clicked_at} glyph="▶" tone="green" title="Opened site" /></td>
  ```
  Note: update the empty-state `colSpan` (currently 9) to 10 for the extra column.
- Replace `ScanBadge` with a parameterized badge:
  ```tsx
  function EngageBadge({ count, at, glyph, tone, title }: { count: number; at: string | null; glyph: string; tone: "green" | "muted"; title: string }) {
    if (count <= 0) return <span style={{ color: "#c9c7c0", fontSize: 12 }} title={`No ${title.toLowerCase()} yet`}>—</span>;
    const when = at ? new Date(at).toLocaleDateString() : "";
    const c = tone === "green"
      ? { color: "#0a7a3d", background: "#e7f5ec", border: "1px solid #b7e0c4" }
      : { color: "#555553", background: "#f0eeea", border: "1px solid #d8d6cf" };
    return (
      <span title={`${title} ${count}×${when ? ` — last ${when}` : ""}`}
        style={{ display: "inline-block", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, borderRadius: 4, padding: "2px 6px", ...c }}>
        {glyph} {count}
      </span>
    );
  }
  ```

**Step 3: Verify**

Run: `npx tsc --noEmit` → Expected: exit 0 (no remaining `scan_count` references — grep to confirm: `npx --no-install rg scan_count components/admin/templates/SalesBoard.tsx app/admin/templates/sales/page.tsx` should return nothing, or use the Grep tool).

**Step 4: Commit**

```bash
git add app/admin/templates/sales/page.tsx components/admin/templates/SalesBoard.tsx
git commit -m "feat(templates): sales board shows looked-up/opened instead of scans"
```

---

## Task 8: Postcard QR → static `/join`

One QR image for the whole print run.

**Files:**
- Modify: [lib/templates/mail/qr.ts](../../lib/templates/mail/qr.ts)
- Modify: [lib/templates/mail/send.ts](../../lib/templates/mail/send.ts)

**Step 1: Add a `joinUrl()` helper in qr.ts**

```ts
/** Single static lookup URL printed (as one shared QR) on every postcard. */
export function joinUrl(): string {
  return `${qrBaseUrl()}/join`;
}
```

**Step 2: send.ts — point the `qr_url` merge var at it**

Replace both `qr_url: qrTrackingUrl(qrToken)` / the CSV `qrTrackingUrl(qrToken)` value with `joinUrl()`. Update the import: `import { generateQrToken, joinUrl } from "@/lib/templates/mail/qr";` (drop `qrTrackingUrl` if now unused — tsc will flag it). Leave `qr_token` minting and the `/r/` route as-is (harmless; the old per-card path stays available).

**Step 3: Verify**

Run: `npx tsc --noEmit` → Expected: exit 0.
Run: `npx vitest run lib/templates` → Expected: all pass.

**Step 4: Commit**

```bash
git add lib/templates/mail/qr.ts lib/templates/mail/send.ts
git commit -m "feat(templates): postcard QR points at single /join lookup"
```

---

## Task 9: Full verification + gating

**Step 1: Type-check + suite**

Run: `npx tsc --noEmit` → Expected: exit 0.
Run: `npx vitest run lib/templates` → Expected: all pass (count = prior 90 + new match tests).

**Step 2: Gating check (manual, no dev server unless approved)**

Confirm by reading, not running a server: `/join`, `app/api/templates/find`, both call `templatesEnabled()` and return 404 when off; `/s/[id]` and `/r/[token]` intentionally do NOT gate (printed/shared links must survive a flag flip).

**Step 3: Final review**

Re-read the diff for: no `git add -A`/secrets, additive migration only, `record` JSONB still written by the callback, no `scan_count` references left on the board.

---

## Deployment (after plan execution, on the user's word)

1. Migration already applied in Task 1 (prod Supabase). Re-confirm it ran.
2. Stage files by name, `/scan-secrets`, commit, push `origin/main` (Vercel auto-deploys).
3. No Trigger.dev change (no task code touched).
4. Set the postcard template's QR to `https://www.websitereveals.com/join` and verify a name+ZIP lookup → "Open your site" → preview, with the board's Looked-up/Opened counts incrementing.

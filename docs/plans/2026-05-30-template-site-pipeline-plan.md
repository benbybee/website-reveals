# Template Site Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a self-contained "Template Site" module in WR that scrapes businesses by industry via Apify, enriches them into SL-spec records, manages them in a mini-CRM with a full sales funnel, and pushes qualified records to SiteLaunchr in batches.

**Architecture:** Fully isolated `tpl_` namespace (own DB tables, own routes `app/(api/)admin/templates/*`, own code `lib/templates/*`), gated by `TEMPLATES_ENABLED`. Pipeline orchestrated as Trigger.dev v3 tasks: discover (Apify Google Places) → on-request deep audit → Facebook/social enrichment + deterministic color/services extraction → completeness gate → chunked batch push to SL behind a swappable transport adapter. Correctness-critical logic is pure + unit-tested; network stages are tested against captured fixtures.

**Tech Stack:** Next.js 16 (app router), Supabase (Postgres via `@supabase/supabase-js`), Trigger.dev v3, Apify actors, Vitest (new, unit), Playwright (existing, e2e). Design doc: `docs/plans/2026-05-30-template-site-pipeline-design.md`.

**Conventions:**
- Reference the design doc for any shape questions (canonical record, `prep.brief` mapping, reliability matrix).
- TDD for all pure logic. Fixture-based tests for mappers. No live API calls in CI.
- Frequent small commits. Stage files **by name** (never `git add .` — see global CLAUDE.md hard rule). Run `/scan-secrets` before any commit that touches non-doc files.
- Never start a dev server without explicit user approval (global hard rule). UI verification tasks must pause and ask.

---

## Phase 0 — Tooling & module scaffold

### Task 0.1: Add Vitest unit-test runner

**Files:**
- Modify: `package.json` (scripts + devDeps)
- Create: `vitest.config.ts`

**Step 1: Install Vitest**

Run: `npm i -D vitest@^3`
Expected: added to devDependencies, no peer-dep errors.

**Step 2: Add test script**

In `package.json` `scripts`, add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

**Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["lib/templates/**/*.test.ts"],
    environment: "node",
  },
});
```

**Step 4: Smoke test**

Create `lib/templates/_smoke.test.ts`:
```ts
import { describe, it, expect } from "vitest";
describe("smoke", () => { it("runs", () => { expect(1 + 1).toBe(2); }); });
```

Run: `npm test`
Expected: 1 passing test.

**Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts lib/templates/_smoke.test.ts
git commit -m "chore(templates): add vitest unit runner + module test dir"
```

### Task 0.2: Feature flag + env scaffold

**Files:**
- Create: `lib/templates/config.ts`
- Modify: `.env.example` (names only, no values)

**Step 1: Write the failing test**

`lib/templates/config.test.ts`:
```ts
import { describe, it, expect, afterEach } from "vitest";
import { templatesEnabled } from "./config";

afterEach(() => { delete process.env.TEMPLATES_ENABLED; });

describe("templatesEnabled", () => {
  it("is false when unset", () => { expect(templatesEnabled()).toBe(false); });
  it("is true when '1'", () => { process.env.TEMPLATES_ENABLED = "1"; expect(templatesEnabled()).toBe(true); });
});
```

**Step 2: Run → fail** (`npm test` → cannot find `./config`).

**Step 3: Implement** `lib/templates/config.ts`:
```ts
export function templatesEnabled(): boolean {
  return process.env.TEMPLATES_ENABLED === "1";
}

export const APIFY_TOKEN = () => process.env.APIFY_TOKEN ?? "";
export const SL_TEMPLATE_TRANSPORT = () =>
  (process.env.SL_TEMPLATE_TRANSPORT ?? "post") as "post" | "table";
export const SL_TEMPLATE_BATCH_URL = () => process.env.SL_TEMPLATE_BATCH_URL ?? "";
```

**Step 4: Run → pass.**

**Step 5:** Append to `.env.example`:
```
TEMPLATES_ENABLED=
APIFY_TOKEN=
SL_TEMPLATE_TRANSPORT=post
SL_TEMPLATE_BATCH_URL=
```

**Step 6: Commit** (`git add lib/templates/config.ts lib/templates/config.test.ts .env.example` — confirm `.env.example` only, never a real `.env`).

---

## Phase 1 — Database schema

> Migrations use the project's existing runner (`scripts/apply-migration.mjs`, `DATABASE_URL`/`POSTGRES_URL_*`). One migration file per table keeps them reviewable and individually reversible. **Do not** run migrations without confirming the target DB with the user.

### Task 1.1: `tpl_industries` table

**Files:** Create `supabase/migrations/<ts>_tpl_industries.sql` (match existing migration naming; check `supabase/migrations/` for the convention first).

```sql
create table if not exists tpl_industries (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  display_name text not null,
  google_categories text[] not null default '{}',
  sl_slug text not null,            -- controlled-vocab industry_slug SL matches templates on
  created_at timestamptz not null default now()
);
```

Steps: (1) write SQL, (2) run via `node scripts/apply-migration.mjs <file>` **after user confirms DB**, (3) verify table exists (`\d tpl_industries` or a `select` ), (4) commit the `.sql` file.

### Task 1.2–1.7: remaining tables

Same pattern (one migration each, confirm DB, verify, commit). Columns per design §3:

- **`tpl_campaigns`**: `id`, `industry_slug` (fk-soft → `tpl_industries.slug`), `locations jsonb`, `target_count int`, `audit_enabled bool default false`, `status text default 'draft'`, `scraped_count int default 0`, `qualified_count int default 0`, `incomplete_count int default 0`, `pushed_count int default 0`, `created_by text`, `created_at`, `updated_at`.
- **`tpl_prospects`**: `id`, `campaign_id` (fk → tpl_campaigns), `source_id text unique not null`, `place_id text`, `record jsonb not null`, `business_name text`, `city text`, `state text`, `phone text`, `website text`, `website_status text default 'none'`, `confidence numeric`, `completeness jsonb`, `stage text default 'scraped'`, `agent_id text`, `created_at`, `updated_at`. Index on `(campaign_id, stage)`, `(campaign_id, website_status)`.
- **`tpl_prospect_assets`**: `id`, `prospect_id` (fk, on delete cascade), `kind text` (`logo`/`photo`), `slot text`, `src_url text`, `alt text`, `width int`, `height int`, `fetch_verified bool default false`, `created_at`.
- **`tpl_cost_events`**: `id`, `campaign_id` (fk), `stage text` (`discover`/`audit`/`enrich`/`backfill`), `actor text`, `units numeric`, `usd numeric`, `run_id text`, `created_at`.
- **`tpl_sales_activity`**: `id`, `prospect_id` (fk), `agent_id text`, `kind text` (`stage_change`/`note`/`call`), `from_stage text`, `to_stage text`, `body text`, `created_at`.
- **`tpl_sl_batches`**: `id`, `campaign_id` (fk), `batch_id text unique`, `chunk_count int`, `record_count int`, `transport text`, `status text default 'pending'`, `sl_response jsonb`, `created_at`, `updated_at`.

After all migrations: commit. Optional helper `lib/templates/db.ts` returning a typed Supabase service-role client scoped to these tables (reuse existing Supabase client factory; do not create a new credential path).

---

## Phase 2 — Pure-logic core (full TDD)

All functions live in `lib/templates/normalize/` and `lib/templates/score/`. Pure, no I/O. These are the correctness-critical pieces SL depends on.

### Task 2.1: Phone → E.164

**Files:** Create `lib/templates/normalize/phone.ts` + `.test.ts`.

**Step 1: Failing test**
```ts
import { describe, it, expect } from "vitest";
import { toE164 } from "./phone";

describe("toE164", () => {
  it("formats a 10-digit US number", () => expect(toE164("(480) 555-1234")).toBe("+14805551234"));
  it("keeps an existing +1", () => expect(toE164("+1 480 555 1234")).toBe("+14805551234"));
  it("strips a leading 1", () => expect(toE164("1-480-555-1234")).toBe("+14805551234"));
  it("returns null for junk", () => expect(toE164("call us!")).toBeNull());
  it("returns null for wrong length", () => expect(toE164("555-1234")).toBeNull());
});
```

**Step 2: Run → fail.**

**Step 3: Implement**
```ts
export function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  const ten = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (ten.length !== 10) return null;
  return `+1${ten}`;
}
```

**Step 4: Run → pass. Step 5: Commit.**

### Task 2.2: State → 2-letter

**Files:** `lib/templates/normalize/state.ts` + `.test.ts`. Map full names → USPS abbreviations; pass through valid 2-letter; return null otherwise.

Test cases: `"Arizona" → "AZ"`, `"az" → "AZ"`, `"TX" → "TX"`, `"Freedonia" → null`. Implement with a `Record<string,string>` lookup keyed on lowercased full name + a set of valid abbreviations. TDD, commit.

### Task 2.3: Hours → 24h structured

**Files:** `lib/templates/normalize/hours.ts` + `.test.ts`.

Target output: `Array<{ day: "mon"|...|"sun"; open: "HH:MM"; close: "HH:MM" } | { day: ...; closed: true }>`. Input is the GBP/Apify `openingHours` array (capture real shape in Phase 3 fixture spike; **write this against that fixture**). For the first pass, test the time-parsing helper purely:

Test the helper `parse12h("8:00 AM") → "08:00"`, `parse12h("5:30 PM") → "17:30"`, `parse12h("12:00 AM") → "00:00"`, `parse12h("Closed") → null`. Implement + TDD + commit. The full GBP-array → structured mapper is finished in Phase 3 once the fixture exists.

### Task 2.4: URL absolutizer

**Files:** `lib/templates/normalize/url.ts` + `.test.ts`. `absolutize("example.com") → "https://example.com"`, passes through `https://`, upgrades `http://`→`https://` only when no explicit scheme? (Keep `http`→`https` upgrade OFF to avoid breaking fetchable URLs — only add scheme when missing.) Return null for empty/invalid. TDD, commit.

### Task 2.5: Completeness + confidence scorer & gate

**Files:** `lib/templates/score/gate.ts` + `.test.ts`. This is the field that decides what reaches SL — highest-value tests.

**Step 1: Failing test**
```ts
import { describe, it, expect } from "vitest";
import { scoreRecord, isQualified } from "./gate";
import type { CanonicalRecord } from "../types";

const base: CanonicalRecord = {
  source_id: "wr-tpl-x", business_name: "Joe's Pest", industry_slug: "pest-control",
  address: { street: "1 Main", city: "Mesa", state: "AZ", zip: "85201", country: "US" },
  phone: "+14805551234", photos: [{ slot: "hero", src_url: "https://x/p.jpg" }],
} as CanonicalRecord;

describe("gate", () => {
  it("qualifies a record meeting the minimum", () => {
    const s = scoreRecord(base);
    expect(isQualified(s)).toBe(true);
    expect(s.missing).toEqual([]);
  });
  it("fails without phone", () => {
    const s = scoreRecord({ ...base, phone: undefined as any });
    expect(isQualified(s)).toBe(false);
    expect(s.missing).toContain("phone");
  });
  it("fails with neither logo nor photos", () => {
    const s = scoreRecord({ ...base, photos: [] });
    expect(isQualified(s)).toBe(false);
    expect(s.missing).toContain("logo_or_photos");
  });
  it("lowers confidence when identity anchor is weak", () => {
    const weak = scoreRecord({ ...base, address: { ...base.address, street: "" } });
    expect(weak.confidence).toBeLessThan(scoreRecord(base).confidence);
  });
});
```

**Step 2: Run → fail.**

**Step 3: Implement** `gate.ts` (and minimal `lib/templates/types.ts` for `CanonicalRecord`):
```ts
import type { CanonicalRecord } from "../types";

const REQUIRED = ["source_id", "business_name", "industry_slug", "address", "phone"] as const;

export interface ScoreResult { missing: string[]; completeness: number; confidence: number; }

export function scoreRecord(r: CanonicalRecord): ScoreResult {
  const missing: string[] = [];
  for (const k of REQUIRED) if (!present((r as any)[k])) missing.push(k);
  const hasAddr = r.address && present(r.address.street) && present(r.address.city) && present(r.address.state);
  if (!hasAddr && !missing.includes("address")) missing.push("address");
  const hasAsset = !!r.logo?.src_url || (r.photos?.length ?? 0) > 0;
  if (!hasAsset) missing.push("logo_or_photos");

  // identity anchor = name + full address + phone
  let anchor = 0;
  if (present(r.business_name)) anchor += 0.34;
  if (hasAddr && present(r.address.zip)) anchor += 0.33;
  if (r.phone) anchor += 0.33;

  const allFields = [...REQUIRED, "logo_or_photos", "hours", "services", "brand_colors", "email"];
  const filled = allFields.filter((f) => !missing.includes(f) && presentField(r, f)).length;
  return { missing, completeness: filled / allFields.length, confidence: round2(anchor) };
}

export function isQualified(s: ScoreResult): boolean { return s.missing.length === 0; }

function present(v: unknown): boolean {
  return v != null && (typeof v !== "string" || v.trim().length > 0);
}
function presentField(r: CanonicalRecord, f: string): boolean {
  if (f === "logo_or_photos") return !!r.logo?.src_url || (r.photos?.length ?? 0) > 0;
  if (f === "hours") return (r.hours?.length ?? 0) > 0;
  if (f === "services") return (r.services?.length ?? 0) > 0;
  if (f === "brand_colors") return !!r.brand_colors?.primary;
  return present((r as any)[f]);
}
function round2(n: number): number { return Math.round(n * 100) / 100; }
```

**Step 4: Run → pass. Step 5: Commit.**

### Task 2.6: `source_id` builder

**Files:** `lib/templates/normalize/sourceId.ts` + `.test.ts`. `sourceId("ChIJ...") → "wr-tpl-ChIJ..."`; throw if `place_id` empty (dedupe key must be stable & present). TDD, commit.

### Task 2.7: Batch chunker

**Files:** `lib/templates/sl/chunk.ts` + `.test.ts`.

```ts
import { describe, it, expect } from "vitest";
import { chunkBatch } from "./chunk";

describe("chunkBatch", () => {
  it("splits 3500 records into 7 chunks of ≤500", () => {
    const recs = Array.from({ length: 3500 }, (_, i) => ({ source_id: `s${i}` }));
    const chunks = chunkBatch(recs as any, "camp-1", "batch-1", 500);
    expect(chunks.length).toBe(7);
    expect(chunks.every((c) => c.records.length <= 500)).toBe(true);
    expect(chunks[0]).toMatchObject({ campaign_id: "camp-1", batch_id: "batch-1", chunk_index: 0, chunk_total: 7 });
  });
  it("returns a single chunk under the limit", () => {
    expect(chunkBatch([{ source_id: "a" }] as any, "c", "b", 500).length).toBe(1);
  });
});
```

Implement, run → pass, commit.

### Task 2.8: Canonical → `prep.brief` mapper

**Files:** `lib/templates/sl/toPrepBrief.ts` + `.test.ts`. Maps a `CanonicalRecord` into the SL delivery shape per design §6 table. Test asserts every mapping path:

```ts
expect(toPrepBrief(rec)).toMatchObject({
  brief: {
    business: { name: rec.business_name, industry: rec.industry_raw, industry_slug: rec.industry_slug, services: rec.services },
    contact: { address: rec.address, phone: rec.phone, email: rec.email, hours: rec.hours },
    brand: { colors: rec.brand_colors },
  },
  current_site_brand: { logo_url: rec.logo?.src_url ?? null },
  stock_photos: rec.photos.map((p) => ({ slot: p.slot, src_url: p.src_url, alt: p.alt ?? "" })),
});
```
Assert `kura_input` is **omitted** for speculative Stage-1 records. Implement, TDD, commit.

---

## Phase 3 — Apify integration

### Task 3.1: Apify client wrapper

**Files:** `lib/templates/apify/client.ts` + `.test.ts` (mock `fetch`).

Thin wrapper over Apify's run-sync-get-dataset-items REST endpoint: `runActor(actorId, input)` → `{ items, runId, stats }`. Reads `APIFY_TOKEN()`. Test with a mocked `fetch` asserting URL/auth header/body shape + parsed return. Implement, commit. **Also** export `recordCostFromRun(campaignId, stage, actor, stats)` that computes `usd` from `stats` × per-actor unit constants (constants in `lib/templates/apify/costs.ts`) and inserts a `tpl_cost_events` row.

### Task 3.2: Fixture-capture spike (manual, gated on user)

**This task requires a real Apify token and the user's go-ahead to spend a few credits.** Do not run it silently.

- Create `scripts/templates/capture-fixtures.mjs` that runs each actor once against a tiny query (e.g. "pest control Gilbert AZ", 3 results) and writes raw JSON to `lib/templates/__fixtures__/{places,facebook,techstack,lighthouse}.json`.
- Ask the user to approve running it (cost preview: ~N credits). Run it, commit the fixtures.
- These fixtures are the source of truth for all mapper tests below. **Do not invent these shapes.**

### Task 3.3: Places discover mapper

**Files:** `lib/templates/apify/places.ts` + `.test.ts` (uses `__fixtures__/places.json`).

`mapPlaceToRecord(placeItem) → Partial<CanonicalRecord>`: extracts name, address (split → street/city/state/zip via the normalizers from Phase 2), phone→E.164, website, geo, hours (finish Task 2.3's GBP-array mapper here against the real fixture), photos[]→`{slot,src_url}`, place_id→source_id. Sets `website_status` from website presence. Test asserts the mapped record against the fixture. Implement, TDD, commit.

### Task 3.4: Color extraction (4 tokens)

**Files:** `lib/templates/enrich/colors.ts` + `.test.ts`.

Deterministic extraction from a logo image → `{ primary, accent, neutral_dark, neutral_light }` hex. Use a small pure palette-extraction lib (e.g. `node-vibrant` or a k-means on decoded pixels). Test against a committed sample logo PNG in `__fixtures__/` asserting valid hex strings + that `neutral_dark` is darker than `neutral_light` (luminance check). Implement, TDD, commit.

---

## Phase 4 — Enrichment stages

### Task 4.1: Facebook/social enrichment mapper
`lib/templates/enrich/facebook.ts` + `.test.ts` (fixture). Map FB page item → `{ logo (profile img), photos (cover), hours, services[], socials.facebook, description }`. Merge into the record without overwriting non-empty GBP values. TDD against fixture, commit.

### Task 4.2: Services extraction & merge
`lib/templates/enrich/services.ts` + `.test.ts`. Derive `services[]` `{name, description}` from GBP categories/attributes + FB services section; dedupe by name. TDD, commit.

### Task 4.3: Asset verification
`lib/templates/enrich/verifyAssets.ts` + `.test.ts` (mock `fetch` HEAD). For each logo/photo URL: HEAD request, require 2xx + image content-type; capture dimensions if available; mark `fetch_verified`. Drop unverified URLs from the record before scoring. Test: a 200 image passes, a 404/redirect-to-login fails and is dropped. Commit.

### Task 4.4: Enrichment orchestrator (pure assembly)
`lib/templates/enrich/index.ts` + `.test.ts`. Given a discovered partial record, apply: facebook → services → colors → verifyAssets → normalize → `scoreRecord`. Returns the full `CanonicalRecord` + `ScoreResult`. Fixture-based end-to-end (no network in test — pass pre-fetched fixture inputs). Commit.

---

## Phase 5 — Deep audit + cost estimate

### Task 5.1: Staleness scorer
`lib/templates/audit/staleness.ts` + `.test.ts`. Inputs: tech-stack fixture + lighthouse fixture. Output `{ stale: boolean, score, signals[] }` (no HTTPS, parked/dead CMS, mobile/perf < threshold, old copyright). TDD against fixtures, commit.

### Task 5.2: Cost estimator
`lib/templates/apify/estimate.ts` + `.test.ts`. `estimate(actor, n) → { units, usd }` from per-actor constants. Pure. Powers the "select 100 → ~$X" preview. TDD, commit.

---

## Phase 6 — Trigger.dev orchestration

> Tasks live in `src/trigger/templates/`. Each stage is its own retriable task. Follow the existing `src/trigger/*.ts` patterns. These are integration-tested manually (Phase 12), not in CI.

### Task 6.1: `discover` task
`src/trigger/templates/discover.ts`: input `{ campaignId }` → read campaign → run places actor per (industry×location) → map via `places.ts` → upsert `tpl_prospects` on `source_id` → record cost → update campaign counts → set prospect stage `scraped`. Concurrency cap + backoff. Commit.

### Task 6.2: `enrich` task
`src/trigger/templates/enrich.ts`: input `{ campaignId }` → for each `scraped` prospect, set `enriching`, run enrichment orchestrator (fetch FB + assets), persist `record` + assets + score → set `qualified`/`incomplete`, record cost, update counts. Batched with partial-failure isolation. Commit.

### Task 6.3: `deepAudit` task (on-request)
`src/trigger/templates/deep-audit.ts`: input `{ campaignId, prospectIds }` → run tech-stack + lighthouse on the `has_site` subset → staleness score → promote `stale` into qualified pool → record cost. Triggered only by explicit API action. Commit.

### Task 6.4: `backfill` task (on-request)
`src/trigger/templates/backfill.ts`: input `{ prospectIds }` → run heavier enrichment actors targeting missing fields only → re-score → flip `incomplete`→`qualified` where possible → record cost. Commit.

---

## Phase 7 — Cost ledger queries

### Task 7.1: Rollup helpers
`lib/templates/cost/rollup.ts` + `.test.ts`. `campaignCost(campaignId)` → totals by stage + `costPerQualified`. Test against seeded fixture rows (mock the DB layer or use an in-memory array). Commit.

---

## Phase 8 — API routes

> All under `app/api/templates/*`, guarded by `templatesEnabled()` (404 when off) + existing admin auth. Validate inputs. Thin controllers → call lib + trigger.

- **Task 8.1** `POST /api/templates/campaigns` — create campaign, return id.
- **Task 8.2** `POST /api/templates/campaigns/[id]/run` — trigger `discover`.
- **Task 8.3** `POST /api/templates/campaigns/[id]/deep-audit` — body `{ prospectIds }`, trigger `deepAudit`. Returns cost estimate if `dryRun:true`.
- **Task 8.4** `POST /api/templates/prospects/backfill` — body `{ prospectIds }`, trigger `backfill` (+ dry-run estimate).
- **Task 8.5** `GET /api/templates/campaigns/[id]/prospects` — paged, filterable (stage, completeness, missing-field, agent, website_status).
- **Task 8.6** `PATCH /api/templates/prospects/[id]` — inline field edits + `stage`/`agent_id` changes; writes `tpl_sales_activity`.
- **Task 8.7** `POST /api/templates/sales/activity` — call log / note.
- **Task 8.8** `POST /api/templates/campaigns/[id]/push` — assemble qualified → chunk → dispatch via adapter (Phase 11).

Each task: write the route, a minimal request-validation test where logic is non-trivial, commit.

---

## Phase 9 — CRM UI

> `app/admin/templates/*`. Server components for data, client components for interaction. Match existing `app/admin/*` styling/patterns. **UI verification requires a dev server — pause and ask the user before starting one** (global hard rule).

- **Task 9.1** Campaigns list + new-campaign form (`/admin/templates`) with live counts + cost rollup.
- **Task 9.2** Prospect CRM table (`/admin/templates/campaigns/[id]`): columns, completeness badge (green/red + missing count), filters/sorts, bulk-select.
- **Task 9.3** Bulk action bar: `Enrich more`, `Run deep audit` (both show cost estimate dialog before firing), `Assign agent`, `Approve for SL`.
- **Task 9.4** Prospect detail drawer: full record, asset thumbnails (verified ✓/✗), provenance, inline editor.

### Task 9.5: Nav entry (flag-gated)
Add a "Template Sites" entry to the admin nav, rendered only when `templatesEnabled()`. Commit.

---

## Phase 10 — Sales view

- **Task 10.1** `/admin/templates/sales`: agent-scoped board/list by `stage`, click-to-call, live SL preview URL, stage dropdown, call-log/notes → `tpl_sales_activity`. Commit per coherent slice.

---

## Phase 11 — SL adapter + callback

### Task 11.1: Transport adapter
`lib/templates/sl/adapter.ts` + `.test.ts`. `pushBatch(chunks)` dispatches per `SL_TEMPLATE_TRANSPORT()`:
- `post` → HMAC-sign (reuse signing util from `lib/sitelaunchr.ts`) + POST each chunk; record per-chunk status in `tpl_sl_batches`.
- `table` → write records to the shared store/Blob.
Test (mock fetch/db): both modes emit identical `prep.brief` record JSON; per-chunk failures are isolated + retryable. Commit.

### Task 11.2: Callback endpoint
`app/api/templates/sl-callback/route.ts` + test. HMAC + timestamp verification (mirror existing `/api/sl-callback` security). Per-record status → update `tpl_prospects.stage` (`building`→`live` + store preview URL, or `build_failed`). **Separate from the existing callback** — no shared handler. Commit.

### Task 11.3: Push assembler
`lib/templates/sl/push.ts` + `.test.ts`. Given `campaignId`: load `qualified` prospects → `toPrepBrief` each → `chunkBatch` → create `tpl_sl_batches` row → `adapter.pushBatch`. Dry-run mode validates the artifact against the record schema without sending. Commit.

---

## Phase 12 — End-to-end dry run

### Task 12.1: Schema-validation contract test
`lib/templates/sl/contract.test.ts`: assert a fully-enriched fixture record, run through `toPrepBrief`, satisfies SL's required `prep.brief.*` fields (name, contact.address/phone, industry_slug) and the documented 4-key `brand.colors` shape. Commit.

### Task 12.2: Manual E2E (gated)
With user approval (real Apify spend + possibly a dev server): run one tiny campaign (pest control, single small city, target ~25) → discover → enrich → review CRM → **dry-run** push (no live SL send unless user confirms). Document results in the campaign. Capture any shape surprises back into fixtures/mappers.

---

## Sequencing notes

- Phases 0–2 have **zero external dependencies** — build them first, fully tested, regardless of Apify/SL readiness.
- Phase 3 Task 3.2 (fixture capture) **gates** every mapper test in Phases 3–5 — do it before writing those mappers, and it needs the user's token + cost approval.
- Phase 11's `post` transport is **blocked on SL confirming endpoint/credentials**; build the adapter against the `table` mode + dry-run first so we're never blocked, then flip config when SL confirms (design §11 open items).
- Each UI/E2E task that needs a running server must **stop and ask** per the global no-dev-server rule.

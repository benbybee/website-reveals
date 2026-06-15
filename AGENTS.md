# AGENTS.md — Website Reveals (canonical)

> **This file is the canonical source of truth for how agents and engineers operate in this repository.** Tool-specific adapters (e.g. [`CLAUDE.md`](./CLAUDE.md)) point HERE and must not carry unique governing doctrine. If an adapter and this file disagree, this file wins. See [Adapter synchronization](#adapter-synchronization).

## What this repository is
Website Reveals (WR) — internal package name `obsession-marketing-onboarding` — is a Next.js (App Router) + Trigger.dev v3 + Supabase platform that runs a web-design agency end to end: it intakes clients, dispatches automated website builds to a partner build engine, manages client/sales-rep work, bills for builds, and runs an outbound "Template Site" go-to-market machine (scrape → enrich → qualify → speculative preview → postcard → convert).

- **Production:** `www.websitereveals.com` (Vercel project `obsession-marketing-onboarding`, auto-deploys on push to `main`).
- **Background work:** Trigger.dev project `proj_peoqklwfpgsdsfttdwhr`.
- **Data:** Supabase (Postgres + Storage), service-role server-side.

## Repository classification
**Tier 3 — distributed participant** ([Repository Classification Standard](./brain/standards/repository-classification-standard.md)). WR owns or co-owns runtime contracts with separately-owned partner repositories and therefore installs the full Contracts Framework and distributed maintenance doctrine. See [the contracts registry](./brain/contracts/README.md).

Partner seams:
- **SiteLaunchr** — the build engine. WR sends builds + conversions; SL sends status callbacks. (C1–C4)
- **Dispatchr** — Ben's Mission Control. WR emits lifecycle events. (C5)
- **Kura** — the site CMS/portal. Reached **only** via SL `/api/conversions`; WR has no direct Kura seam.

## The brain
The `brain/` directory is the operating memory of this repo. Start at [`brain/README.md`](./brain/README.md). Key entry points:
- [Current state](./brain/current-state.md) — what is true now.
- [Subsystem map](./brain/subsystem-map.md) — the 11 subsystems and how they relate.
- [Loop register](./brain/loop-register.md) — every closed-loop process and its evaluator/escalation.
- [Contracts registry](./brain/contracts/README.md) — the 5 distributed seams.
- [Gap matrix](./brain/gap-matrix.md) — known missing evaluators/gates/escalations.
- [Decisions](./brain/decisions/) — ADRs explaining why the system is shaped as it is.

## Operating doctrine (binding)
These standards govern all design and implementation work here. They are vendor-neutral; the brain applies them to this repo.
1. [Loop Engineering Constitution](./brain/standards/loop-engineering-constitution.md) — outcomes over outputs; everything non-trivial is a loop with goal/executor/evaluator/retry/escalation; irreversible actions need a gate; observability is part of done; brain lockstep.
2. [Evaluator Standard](./brain/standards/evaluator-standard.md) — "it didn't throw" is not evaluation.
3. [Runtime Loop Standard](./brain/standards/runtime-loop-standard.md) — canonical states; one source of truth per item; claim-stale recovery.
4. [Contracts Framework](./brain/standards/contracts-framework.md) — every distributed seam is registered and conformance-checked.
5. [Loop-First PRD Standard](./brain/standards/loop-first-prd-standard.md) — specify work as loops/outcomes.
6. [ADR Framework](./brain/standards/adr-framework.md) — record decisions.
7. [Pattern Library](./brain/standards/pattern-library.md) — endorsed reusable patterns.

## Repository working agreements
- **Enterprise-grade foundation, no rebuild-forcing shortcuts.** Prefer the durable approach; if a shortcut is taken, name the debt in an ADR and the gap matrix.
- **Root-cause before fix.** Diagnose and state the cause before changing code; no band-aids that mask systemic issues.
- **Never commit secrets.** Stage files by name; never `git add -A`. Never stage `.env*` (except `.env.example`). Run `/scan-secrets` before every commit. (Production secrets were once committed via `git add .` — never again.)
- **Never start a local dev server without explicit approval.**
- **Distributed seams change by protocol:** ADR → `/cross-repo-review` → coordinated deploy. Local tools cannot observe partner repos.

## Build, test, deploy (real commands)
- Typecheck: `npx tsc --noEmit` • Lint: `npx eslint` • Test: `npx vitest run`
- Web deploy: push to `main` (Vercel auto-deploys). Env added after a deploy needs `npx vercel redeploy <url>`.
- Trigger.dev deploy: `npx trigger.dev@<sdk-version> deploy` (pin to the installed SDK; `@latest` aborts in CI).
- Supabase migration: `npm install pg --no-save` then `node scripts/apply-migration.mjs supabase/migrations/NNN.sql`.

## Slash commands
Architecture/brain commands live in [`.claude/commands/`](./.claude/commands/): `/architect`, `/plan-feature`, `/impact-analysis`, `/architecture-review`, `/cross-repo-review`, `/update-brain`, `/brain-health`, `/architecture-audit`. They encode the loop-first, contracts-aware doctrine above.

## Adapter synchronization
- **AGENTS.md is canonical.** Adapters (`CLAUDE.md`, and any future tool adapter) are thin pointers to this file plus tool-specific ergonomics ONLY.
- A governing rule is added/changed **here first**, then adapters are re-pointed if needed. Never add unique doctrine to an adapter.
- `/brain-health` checks adapter consistency: every adapter must reference AGENTS.md and must not introduce doctrine absent here.
- When the brain changes materially (new subsystem, contract, or loop), run `/update-brain` to keep [current-state](./brain/current-state.md), the registers, and this file in lockstep.

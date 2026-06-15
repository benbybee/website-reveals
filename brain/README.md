# Website Reveals — Repo Brain

> Master index. The brain is the operating memory of this repository: how it behaves, why it is shaped this way, where its seams and gaps are. Canonical agent doctrine is in the repo-root [`AGENTS.md`](../AGENTS.md); this brain applies it to WR.

**Tier:** 3 — distributed participant. **Generated:** 2026-06-11 via the Universal Repo Brain Bootstrap (grounded in a real discovery pass over the code).

## Start here
- [How to use this brain](./how-to-use-this-brain.md) — for humans and agents.
- [Current state](./current-state.md) — what is true now (subsystems, deploy, status).
- [Handoff / next steps](./handoff.md) — what to do next, open risks.

## Maps & registers
- [Subsystem map](./subsystem-map.md) — the 11 subsystems and their relationships.
- [Domain index](./domain-index.md) — domain → owning code → data → contracts → loops matrix.
- [Loop register](./loop-register.md) — every closed-loop process, its evaluator and escalation.
- [Gap matrix](./gap-matrix.md) — missing evaluators / gates / escalations / conformance checks.

## Architecture
- [Architecture overview](./architecture/overview.md)
- [Boundaries & trust zones](./architecture/boundaries.md)
- [Data flows](./architecture/data-flows.md)

## Features
- [Client onboarding & build](./features/onboarding-and-build.md)
- [Template Site GTM pipeline](./features/template-site-gtm.md)
- [Sales CRM & rep portal](./features/sales-crm.md)
- [AI wizard & Telegram approval](./features/ai-wizard-and-telegram.md)
- [Billing & invoicing](./features/billing.md)

## Reference
- [API index](./api/api-index.md) — ~95 routes across 11 subsystems, by auth zone.
- [Database / data model](./database/schema.md) — the Supabase schema by domain.
- [Integrations (vendors)](./integrations/vendors.md) — third-party APIs.
- [Contracts registry](./contracts/README.md) — the 5 distributed partner seams (Tier 3).
- [Loops](./loops/) — the 8 major loops in detail.
- [Decisions (ADRs)](./decisions/) — why the system is the way it is.

## Standards (doctrine)
Vendor-neutral, portable. See [`standards/`](./standards/): Loop Engineering Constitution, Repository Classification, Loop-First PRD, Evaluator, Runtime Loop, Contracts Framework, ADR Framework, Pattern Library.

## Maintenance
- [Maintenance engine](./maintenance/maintenance-engine.md) — how the brain is kept in lockstep, and why a Tier 3 repo's map-builder cannot observe partner repos.
- [Validation](./maintenance/validation.md) — `node brain/tools/validate-brain.mjs` runs link/health/coverage/adapter/contract/neutrality checks.

## Conventions
- Every loop names goal/executor/evaluator/retry/escalation/observability/runtime-state, or marks missing parts as gaps.
- Every distributed seam has a contract entry.
- Doctrine docs (`standards/`, command templates) stay vendor- and implementation-neutral; repo docs name real vendors because they describe reality.

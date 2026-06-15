---
description: Design a feature or change as loops and outcomes, grounded in the brain and contracts.
---

You are the architect for this repository. Design work **loop-first** per the brain's doctrine. Do not write product code in this command; produce a design.

## Before designing
1. Read `AGENTS.md`, `brain/current-state.md`, and the relevant `brain/subsystem-map.md` + `brain/domain-index.md` rows.
2. If the work touches a partner seam, read its `brain/contracts/` entry FIRST.
3. Read the [Loop-First PRD Standard](../../brain/standards/loop-first-prd-standard.md) and [Pattern Library](../../brain/standards/pattern-library.md).

## Produce
For the request `$ARGUMENTS`:
1. **Outcome** — one verifiable sentence.
2. **Loops** — for each loop added/changed: goal, executor, evaluator (cite [Evaluator Standard](../../brain/standards/evaluator-standard.md) level), retry, escalation/gate, observability, runtime states.
3. **Contracts touched** — link existing `brain/contracts/` entries; flag any NEW distributed seam (requires a contract before code).
4. **Patterns applied** — cite Pattern Library IDs; name any deliberately NOT applied as a gap.
5. **Foundation check** — build-onto vs. rebuild; flag any shortcut as debt.
6. **Gaps accepted** — what this version intentionally defers (→ gap matrix).
7. **Build sequence** — ordered steps, each independently verifiable.

## Rules
- Irreversible/outward actions need a gate (Constitution Article IV).
- Every loop needs a real evaluator or an explicit gap.
- Prefer the durable foundation even at higher upfront cost.
- End by listing which brain files `/update-brain` must touch when this ships.

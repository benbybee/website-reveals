---
description: Turn a request into a loop-first implementation plan with verifiable steps.
---

Produce an implementation plan for `$ARGUMENTS`, grounded in the brain.

## Steps
1. **Locate** — find the owning subsystem in `brain/subsystem-map.md` and the code in `brain/domain-index.md`. Read the real files you'll change.
2. **Spec as loops** — apply the [Loop-First PRD Standard](../../brain/standards/loop-first-prd-standard.md): outcome, loops (goal/executor/evaluator/retry/escalation/observability/runtime-states), contracts touched, gaps accepted, foundation check.
3. **Plan** — an ordered task list where each task:
   - changes the smallest coherent unit,
   - states how it is verified (test, typecheck, dry-run, manual),
   - names the evaluator it adds/preserves.
4. **Seam check** — if a partner payload changes, STOP and route through `/cross-repo-review` + an ADR before any code.
5. **Brain impact** — list the `brain/` files `/update-brain` must refresh when done.

## Output
A numbered plan, test-first where a behavior changes ([test-driven-development]), with an explicit "Definition of done = validation green or gaps documented."
Do not start editing code from this command unless the user says to proceed.

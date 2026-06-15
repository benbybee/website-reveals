---
description: Periodic deep audit — does the brain still match the code, and are loops/contracts/gaps still true?
---

A heavier, periodic check that catches drift the per-change commands miss. Read-only; produce a report. Scope: `$ARGUMENTS` or the whole repo.

## Audit
1. **Brain ↔ code drift** — sample each subsystem in `brain/subsystem-map.md`: do the cited files/tables/routes still exist and behave as documented? Treat code as reality; cite mismatches.
2. **Loop reality** — for each loop in the register, confirm the executor/evaluator/escalation still exist in code. A loop whose evaluator was removed is a regression.
3. **Contract reality** — for each contract, confirm the mapper/validator/classifier and auth still match the entry. Flag silent payload drift.
4. **Gap reality** — for each gap-matrix entry, confirm it is still open (or was closed without updating the matrix). Add newly-found gaps.
5. **Dead code & undocumented loops** — find background work / seams not in the brain (e.g. previously: two AI tasks defined but never dispatched). Find brain entries with no live code.
6. **Neutrality & adapter** — run `/brain-health`; confirm doctrine neutrality and adapter sync.

## Output
- Drift report: documented vs. actual, per finding (file:line).
- Regression list (loops/contracts that lost an evaluator/gate).
- New gaps to add; stale brain entries to remove.
- A prioritized remediation list and which commands to run (`/update-brain`, `/cross-repo-review`, ADRs).
Run this on a cadence (e.g. monthly) or after a large merge.

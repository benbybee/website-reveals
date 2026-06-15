---
description: Review a change (or the current diff) against the brain's loop and contract doctrine.
---

Review `$ARGUMENTS` (or the current working-tree diff if no target) against doctrine. Read-only; produce findings.

## Check
1. **Loop integrity** — every touched loop still names goal/executor/evaluator/retry/escalation. No new open loop (evaluator = "didn't throw") slipped in.
2. **Evaluator placement** — evaluation happens BEFORE the irreversible step; one function owns each verdict (no duplicated gate logic — [Evaluator Standard](../../brain/standards/evaluator-standard.md)).
3. **Gate presence** — irreversible/outward actions (send/charge/dispatch/delete) have a gate or dry-run ([Constitution Article IV](../../brain/standards/loop-engineering-constitution.md)).
4. **Contract conformance** — seam payloads go through the single mapper+validator; sign-once/send-exact preserved; idempotency key intact ([Contracts Framework](../../brain/standards/contracts-framework.md)). Any payload change is flagged as cross-repo.
5. **Pattern adherence** — endorsed patterns used where applicable; deviations named.
6. **Observability** — new behavior is observable (status/field/log), not silent.
7. **Brain lockstep** — does this change require `brain/` updates that aren't in the diff? (Constitution Article VII.)

## Output
Findings table: severity (blocking/major/minor) | location (file:line) | doctrine violated | fix direction. End with a go / no-go and the required brain updates.

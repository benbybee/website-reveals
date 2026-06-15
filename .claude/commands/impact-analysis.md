---
description: Trace the blast radius of a proposed change across subsystems, loops, and contracts.
---

Analyze the impact of `$ARGUMENTS` BEFORE it is implemented. Read-only.

## Trace
1. **Code blast radius** — grep for callers/consumers of the symbols/routes/tables touched. List every caller (treat code as reality; cite file:line).
2. **Loop impact** — which [loops](../../brain/loop-register.md) execute through this code? Does the change preserve each loop's evaluator, retry, and escalation? A loop losing its evaluator is a blocking finding.
3. **Contract impact** — does this alter any `brain/contracts/` payload, auth, or response handling? If yes: it is a **distributed change** → requires `/cross-repo-review` + ADR + coordinated deploy. Flag loudly.
4. **Runtime-state impact** — does it change how a work item moves through canonical states ([Runtime Loop Standard](../../brain/standards/runtime-loop-standard.md))? Watch for orphan/claim-stale interactions.
5. **Data impact** — schema/migration effects; soft references (no FK) that could orphan; idempotency/dedup keys affected.
6. **Gap interaction** — does it close, widen, or collide with a [gap matrix](../../brain/gap-matrix.md) entry?

## Output
- Blast-radius list (files + reason).
- Risk table: area | severity | why.
- Verdict: safe-local / needs-review / **needs-cross-repo-coordination**.
- Required follow-ups (tests, ADR, `/cross-repo-review`, brain updates).

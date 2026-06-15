---
description: Bring the brain back into lockstep with the code after a material change.
---

Refresh the brain so it matches reality (Constitution Article VII). Target change: `$ARGUMENTS` (or the current diff).

## Procedure
1. **Diff the world** — what subsystems/loops/contracts/tables/endpoints did the change actually touch? Treat code as reality (read the changed files).
2. **Update, in order:**
   - `brain/current-state.md` — "true now" facts, recently-changed, active risks.
   - `brain/subsystem-map.md` / `brain/domain-index.md` — if a subsystem/owner/data store changed.
   - `brain/loop-register.md` + the relevant `brain/loops/*.md` — if a loop's executor/evaluator/escalation changed; a new loop gets a full entry.
   - `brain/contracts/*` — if a seam payload/auth/response changed (also bump version + change-events; this should have gone through `/cross-repo-review`).
   - `brain/gap-matrix.md` — close gaps that were fixed (only if the evaluator/gate/check actually exists now); add newly-discovered gaps.
   - `brain/decisions/` — add an ADR for any decision worth not re-litigating.
   - `AGENTS.md` — only if governing doctrine or working agreements changed (then re-point adapters).
3. **Validate** — run `node brain/tools/validate-brain.mjs`; fix link/coverage/adapter/contract/neutrality failures.

## Rules
- Do not invent state — every claim must match a file you read.
- Do not close a gap that isn't actually closed in code.
- Keep doctrine docs vendor/implementation-neutral; repo docs name real vendors.
- End with the validation summary and the list of files changed.

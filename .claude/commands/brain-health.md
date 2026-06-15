---
description: Check the brain's internal consistency — links, adapter sync, command coverage, contract readiness, neutrality.
---

Run the brain's self-check and report. Target: the whole brain (or `$ARGUMENTS` to scope).

## Run
1. Execute `node brain/tools/validate-brain.mjs` and read its output.
2. Interpret each check:
   - **Links** — no relative link in `brain/`, `AGENTS.md`, `CLAUDE.md`, or `.claude/commands/` points to a missing file.
   - **Adapter consistency** — `CLAUDE.md` references `AGENTS.md` and introduces no unique doctrine; `AGENTS.md` exists and is canonical.
   - **Command coverage** — all 8 commands exist (`architect`, `plan-feature`, `impact-analysis`, `architecture-review`, `cross-repo-review`, `update-brain`, `brain-health`, `architecture-audit`).
   - **Contract readiness** — every registered contract has the required fields; the registry index lists every contract file and vice-versa.
   - **Standards install** — all 8 standards present.
   - **Vendor/implementation neutrality** — the portable doctrine docs (`brain/standards/**`) contain no vendor/product names. (Command files are repo-operational and exempt.)
3. For any failure, state the file, the rule, and the fix. Do NOT auto-edit unless asked.

## Output
A pass/fail table per check with counts, then a one-line verdict: **GREEN** (all pass) or the prioritized list of fixes. Note that link-checking cannot reach partner repos — distributed-seam correctness is `/cross-repo-review`'s job, not this command's.

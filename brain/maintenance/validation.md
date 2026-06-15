# Validation

> The brain's self-check. Run `node brain/tools/validate-brain.mjs` (also invoked by `/brain-health`).

## Checks
| # | Check | What it proves |
|---|---|---|
| 1 | **Link integrity** | Every relative markdown link in `brain/`, `AGENTS.md`, `CLAUDE.md`, `.claude/commands/` resolves to an existing file. |
| 2 | **Brain health** | Required brain core docs exist (README, how-to-use, current-state, subsystem-map, domain-index, loop-register, gap-matrix, handoff). |
| 3 | **Bootstrap structure** | The expected directory skeleton exists (`standards/`, `contracts/`, `loops/`, `decisions/`, `architecture/`, `features/`, `api/`, `database/`, `integrations/`, `maintenance/`, `tools/`). |
| 4 | **Standards install** | All 8 standards present. |
| 5 | **Command coverage** | All 8 slash commands present in `.claude/commands/`. |
| 6 | **Adapter consistency** | `AGENTS.md` exists; `CLAUDE.md` references it and declares itself an adapter. |
| 7 | **Contract readiness** | Every `brain/contracts/c*.md` has the required fields; registry index ↔ contract files are consistent. |
| 8 | **Vendor-neutral scan** | Portable doctrine docs (`brain/standards/**`) contain no vendor/product names. |
| 9 | **Implementation-neutral scan** | Portable doctrine docs (`brain/standards/**`) contain no implementation-specific identifiers (table names, env vars, function names). |

> Scope note: the neutrality scans target the **portable doctrine** in `brain/standards/**` only. The slash-command files in `.claude/commands/**` are repo-operational tooling and intentionally name the repo's real partners (e.g. `/cross-repo-review` must reference SiteLaunchr/Dispatchr/Kura to be useful), so they are exempt.

## Interpreting results
- **GREEN** = all checks pass → the brain is internally consistent and ready.
- A failure prints `file :: rule :: detail`. Fix and re-run.
- **Scope note:** these checks are entirely local. They do NOT and cannot validate partner-repo conformance — that is `/cross-repo-review`'s job ([maintenance engine](./maintenance-engine.md)).

## Neutrality rule (why two scans)
The portable doctrine in `standards/` must drop into any repo unchanged, so it stays vendor-neutral (no "SiteLaunchr", "Supabase", "Claude", …) and implementation-neutral (no `tpl_prospects`, `ANTHROPIC_API_KEY`, `dispatchBuild`). The repo-specific brain docs (current-state, contracts, integrations, features) and the slash-command files intentionally DO name real things — they describe and operate on this repo's reality — so the scans exclude them.

# Maintenance Engine — Tier 3 distributed participant

> How the brain is kept true over time, and why a Tier 3 repo's local map-builder has a hard blind spot.

## The core constraint
**Local tooling cannot observe partner repositories.** WR's brain, validators, grep, and `validate-brain.mjs` can fully see WR's own code — but they cannot see inside SiteLaunchr, Dispatchr, or Kura. So a "map-changes" maintenance pass can verify everything **local** and nothing **remote**. This is the defining property of a Tier 3 install and it shapes the whole engine.

## What the engine can verify (local)
Run by `node brain/tools/validate-brain.mjs` (and the `/brain-health` command):
- Internal link integrity across `brain/`, `AGENTS.md`, `CLAUDE.md`, `.claude/commands/`.
- Adapter consistency (CLAUDE.md → AGENTS.md, no forked doctrine).
- Command coverage (all 8 commands present).
- Standards install (all 8 standards present).
- Contract readiness (every contract entry has required fields; registry ↔ files match).
- Vendor/implementation neutrality of the portable doctrine docs (`brain/standards/**`).

## What the engine CANNOT verify (remote) — and the substitute
It cannot confirm that SiteLaunchr still accepts WR's `brief` shape, that Dispatchr still understands an event type, or that a new SL required field exists. The substitute is **doctrine, not tooling**:
1. The [contracts registry](../contracts/README.md) is the shared, written model of each seam — the only map both sides can agree on.
2. Every change to a seam goes through **`/cross-repo-review`** (reason about both sides from the registry) + an **ADR** + a **coordinated deploy** plan.
3. Conformance at the seam is proven by the registered checks (mappers/validators/classifiers, HMAC verify) plus partner confirmation — never by assuming the local view is complete.

## Maintenance cadence
| Trigger | Action |
|---|---|
| Any material change merges | `/update-brain` → `node brain/tools/validate-brain.mjs` |
| Before a risky change | `/impact-analysis` |
| Before touching a partner payload | `/cross-repo-review` (BLOCKING) + ADR |
| Before merge | `/architecture-review` |
| Periodically (e.g. monthly) or after a big merge | `/architecture-audit` |

## Drift is a defect
A mismatch between brain and code is treated as a bug (Constitution Article VII), surfaced by `/brain-health` / `/architecture-audit` and repaired by `/update-brain`. A closed gap that silently regressed, or a loop that lost its evaluator, is a regression — not cosmetic.

## What maintenance must never do
- Never assume a partner accepted a change because local tests pass.
- Never fork doctrine into an adapter.
- Never close a gap-matrix entry whose fix isn't actually in the code.
- Never let a doctrine doc acquire a vendor/product name.

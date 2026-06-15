# CLAUDE.md — adapter

> **Adapter, not source of truth.** All governing doctrine for this repository lives in [`AGENTS.md`](./AGENTS.md). This file only points there and adds Claude-Code-specific ergonomics. Do **not** add unique rules here — add them to `AGENTS.md`, then reference them. If this file and `AGENTS.md` ever disagree, `AGENTS.md` wins.

## Read first
1. [`AGENTS.md`](./AGENTS.md) — canonical operating doctrine, tier, working agreements, build/deploy commands.
2. [`brain/README.md`](./brain/README.md) — the brain index.
3. [`brain/current-state.md`](./brain/current-state.md) — what is true right now.

Everything below is convenience for the Claude Code harness. The authority is `AGENTS.md`.

## Tool-specific ergonomics
- **Platform:** Windows + PowerShell. Use PowerShell syntax in the shell (`$env:VAR`, `$null`); the Bash tool is available for POSIX scripts.
- **Slash commands:** the architecture/brain commands in [`.claude/commands/`](./.claude/commands/) are the loop-first workflow entry points — `/architect`, `/plan-feature`, `/impact-analysis`, `/architecture-review`, `/cross-repo-review`, `/update-brain`, `/brain-health`, `/architecture-audit`.
- **Before committing:** run `/scan-secrets`; stage files by name (never `git add -A`); never stage `.env*` except `.env.example` (see `AGENTS.md` → working agreements).
- **Never start a dev server** without explicit in-conversation approval (see `AGENTS.md`).
- **Distributed seams:** changing a SiteLaunchr/Dispatchr payload is a contract change — follow ADR → `/cross-repo-review` → coordinated deploy. The local tools cannot read partner repos.

## How this adapter stays in sync
`AGENTS.md` → [Adapter synchronization](./AGENTS.md#adapter-synchronization) defines the rule: doctrine is edited in `AGENTS.md` first; adapters are re-pointed, never forked. `/brain-health` flags any adapter that drifts (references a missing file, or introduces doctrine not present in `AGENTS.md`).

## Note on global instructions
A user-level global `~/.claude/CLAUDE.md` may also apply to this session. Where it overlaps, the repository's `AGENTS.md` is authoritative for repository-specific doctrine (tier, contracts, loops, working agreements). The global file governs cross-project personal preferences.

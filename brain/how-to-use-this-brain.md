# How to use this brain

## For an agent picking up work
1. Read [`AGENTS.md`](../AGENTS.md) (canonical doctrine) → [`current-state.md`](./current-state.md) (what's true now).
2. Find the subsystem you're touching in the [subsystem map](./subsystem-map.md) and [domain index](./domain-index.md).
3. If your work touches a loop, read its entry in the [loop register](./loop-register.md) and the detailed file in [`loops/`](./loops/). Preserve the loop's evaluator and escalation; if you add a loop, give it all five parts.
4. If your work touches a **partner seam** (SiteLaunchr, Dispatchr, Kura-via-SL), read the [contract entry](./contracts/README.md) FIRST. A payload change is a contract change — follow the change protocol (ADR → `/cross-repo-review` → coordinated deploy).
5. Check the [gap matrix](./gap-matrix.md) so you don't re-discover a known gap or accidentally close one without noticing.
6. Use the slash commands: `/architect` or `/plan-feature` to design, `/impact-analysis` before a risky change, `/architecture-review` / `/cross-repo-review` before merge.

## For a human (operator/engineer)
- "What does this system do right now?" → [current-state](./current-state.md).
- "What talks to what?" → [subsystem map](./subsystem-map.md) + [data flows](./architecture/data-flows.md).
- "What can break across repos?" → [contracts registry](./contracts/README.md).
- "What's missing / risky?" → [gap matrix](./gap-matrix.md) + [handoff](./handoff.md).
- "Why is it built this way?" → [decisions](./decisions/).

## Keeping the brain true
The brain is only useful if it matches the code. After any material change:
- Run `/update-brain` to refresh current-state and the registers.
- Run `/brain-health` (or `node brain/tools/validate-brain.mjs`) to check links, adapter consistency, command coverage, and contract readiness.
- A drift between code and brain is a defect, not a cosmetic issue (Constitution, Article VII).

## What the brain is NOT
- Not a substitute for reading the code on the exact lines you change — it points you to the right files; it does not replace them.
- Not a place for secrets, credentials, or environment values.
- Not where doctrine forks: doctrine lives in `standards/` and `AGENTS.md`; everything else applies it.

# Handoff / Next Steps

> Where to pick up after the brain bootstrap. The brain is installed and grounded; this is the prioritized "what next."

## State at handoff
- Brain installed under `brain/`, canonical [`AGENTS.md`](../AGENTS.md) + [`CLAUDE.md`](../CLAUDE.md) adapter at repo root, 8 slash commands in `.claude/commands/`, validation tooling at `brain/tools/validate-brain.mjs`.
- **No product code was modified.** Everything added is docs, commands, and the validation script.
- Tier 3 confirmed by operator; 5 distributed contracts registered.

## Recommended next steps (priority order)
These are **gap-closing**, not bootstrap work — each is a real engineering task with an owner decision.

1. **G-C5 — durable Dispatchr delivery (High).** Dispatchr lifecycle events can be lost. Options: a small outbox table + cron drain, or move `notifyDispatchr` onto a Trigger.dev task with retries. Decide via an ADR; it changes the C5 contract's failure/retry section.
2. **G-C4 — real cost attribution (High, cross-repo).** Coordinate with SL to emit `cost_usd`/`usage` on `phase=live`. This is a `/cross-repo-review` item — WR's side is already a no-op-ready consumer.
3. **G-AI1 — resolve dead AI tasks (Med).** Either delete `ai-process-inbound` / `ai-telegram-command` or route inbound through them. Incomplete refactor; pick one and update the brain.
4. **G-BUD1 — campaign budget gate (Med).** Add a max-cost gate before/within `tpl-discover`/`tpl-enrich` so a misconfigured campaign can't run up unbounded Apify spend.
5. **G-C3 — conversion retry loop (Med).** Move conversion off the synchronous route onto a retrying task for the retryable outcomes.

## Cross-repo coordination required
G-C4 (cost fields) and any change to C1/C2/C3 payloads or the `brief.industry` slug vocabulary require a coordinated change with SiteLaunchr. Run `/cross-repo-review` first — the local tools cannot see the SL repo, so the [contracts registry](./contracts/README.md) is the only shared map.

## How to keep the brain alive
- After any material change: `/update-brain` then `/brain-health`.
- Before merging a change that touches a partner payload: `/cross-repo-review`.
- Before a risky change: `/impact-analysis`.
- Periodically: `/architecture-audit` to catch drift the per-change checks miss.

## Open questions for the operator
- Billing markup is documented as **2.5×** in the cost contract but one code path references 1.25× — confirm the authoritative value and reconcile (then update [billing feature doc](./features/billing.md)).
- Should sales-rep `agent_id` and `build_jobs.task_id` get real FKs (G-DATA1), or stay soft references intentionally?
- Retention policy for `tpl_qr_scans` / `telegram_conversations` / `pin_login_attempts` (G-HOUSE1)?

# Pattern Library

> Vendor-neutral catalogue of reusable patterns endorsed by this brain's doctrine. Patterns are described abstractly; the brain's feature/integration docs point to where each is used in this repository.

## P1 — Single-mapper / single-validator seam
All payloads for one contract are produced by exactly one mapper and checked by exactly one validator. Call sites never hand-assemble a seam payload. **Prevents** drift between what is sent and what the partner validates.

## P2 — Sign-once, send-exact
For a signed contract, serialize the body once; sign those exact bytes; send those exact bytes. Never re-serialize after signing. **Prevents** signature mismatches from key ordering/whitespace.

## P3 — Idempotency / dedup key
Every outbound exchange carries a stable key (a stable per-entity id). Repeats are safe; the partner deduplicates. **Enables** retries and recovery without double-effect.

## P4 — Fire-and-forget observability notify
Outbound observability events (a partner watching our lifecycle) are best-effort: short timeout, failures logged and swallowed, never thrown into the caller. **Trade-off:** delivery is not guaranteed — acceptable for observability, NOT for state-changing seams. If delivery matters, this pattern is a gap.

## P5 — Evaluator-gated stage machine
Work moves through durable stages; an evaluator's verdict at each boundary chooses the next stage. The stage is the observable record of the verdict. **Implements** Evaluator Standard L1–L2.

## P6 — Dry-run before irreversible send
An irreversible batch action exposes a dry-run that validates and previews counts/cost without sending. The real send is a separate, explicit call. **Implements** Constitution Article IV.

## P7 — Fan-out child tasks with bounded batch
A long sequential job that can exceed a runtime limit becomes a parent that partitions work into small child runs (bounded batch size, bounded concurrency), waits checkpointed, and rolls up results. **Prevents** duration-limit kills; **enables** isolation and parallelism. Children claim items idempotently.

## P8 — Claim-stale recovery
A claim marker carries a freshness stamp. A recovery loop reprocesses only claims older than the executor's max runtime (crash orphans), never fresh in-flight claims. **Prevents** double-processing under concurrency. Pairs with P3.

## P9 — Sandbox-gated provider
A provider that can take a real-money/real-world action selects sandbox vs. live by a credential prefix or base URL; test mode is the safe default. **Implements** a gate for outward-facing actions.

## P10 — Classified outcome over raw HTTP
A seam call returns a small classified outcome (`ok`, retryable, terminal-not-found, …) rather than a raw status, so callers act on meaning without re-parsing HTTP. **Centralizes** retry/escalation policy.

## Using this library
When `/architect` or `/plan-feature` designs a loop or seam, it cites the patterns it applies. When a pattern is deliberately not applied (e.g. P4 used where P3+delivery-guarantee was needed), that is named as a gap.

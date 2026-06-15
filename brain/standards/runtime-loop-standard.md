# Runtime Loop Standard

> Vendor-neutral. Defines the runtime states a loop's work item moves through and the rules for mapping real status fields onto them.

## Canonical runtime states
Every work item in a loop occupies exactly one canonical state at a time:

| State | Meaning |
|---|---|
| **pending** | Accepted, not yet started. |
| **running** | Executor is actively working it. |
| **evaluating** | Work done; evaluator deciding the verdict. |
| **succeeded** | Evaluator passed; outcome achieved (terminal). |
| **held** | Evaluator failed a soft check; awaiting enrichment, retry, or a human. |
| **failed** | Unrecoverable for this attempt (terminal unless swept by a recovery loop). |
| **escalated** | Handed to a human/gate; outside automated flow until resolved. |

## Mapping rules
1. **One source of truth per item.** A durable status/stage field is the canonical state; transient in-memory flags are not.
2. **Map, don't multiply.** A partner's status vocabulary (e.g. `queued|running|succeeded|failed|canceled`) is mapped onto canonical states by a single classifier function, which returns null/`held` for anything unrecognized rather than corrupting state.
3. **Transient claim states are bounded.** A short-lived "in-flight" marker (used to claim an item) must be distinguishable from a stuck item — e.g. by a freshness timestamp — so a recovery loop can tell an active claim from a crash orphan.
4. **Terminal is terminal.** Once `succeeded`, an item is not silently reopened; reprocessing is an explicit, logged decision.

## Recovery and orphans
A crash between "claim" and "complete" leaves an orphan in `running`/in-flight. Recovery doctrine:
- A claim carries a freshness stamp; an item older than the executor's max runtime is a crash orphan, not an active claim.
- A recovery loop re-selects orphans and reprocesses them idempotently.
- Recovery must not double-spend: idempotency keys and "claim only stale" guards are mandatory.

## State observability
The canonical state must be queryable (a column, an index) so that "how many items are held / failed / escalated right now" is answerable without reading logs. Rollups (counts per state) are derived from the canonical field, never tracked in parallel where they can drift.

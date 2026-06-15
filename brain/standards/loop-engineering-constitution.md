# Loop Engineering Constitution

> Governing doctrine. Vendor-neutral and implementation-neutral by design — it must read true for any repository. Repository-specific facts live in the brain, never here.

## Preamble

Software that matters is not a pile of functions; it is a set of **loops** that pursue **outcomes**. A loop runs, checks its own work, and either advances, retries, or escalates to a human. This Constitution defines the non-negotiable shape of a loop and the obligations every loop carries.

## Articles

### Article I — Outcomes over outputs
A unit of work is defined by the outcome it is responsible for, not the code it runs. Every loop states its outcome in one sentence that a non-engineer can verify happened.

### Article II — Everything non-trivial is a loop
Any process that can partially succeed, fail, or drift over time MUST be modeled as a loop with five named parts:
1. **Goal** — the outcome, falsifiably stated.
2. **Executor** — what performs the work.
3. **Evaluator** — what decides whether the outcome was actually achieved.
4. **Retry** — what happens on a recoverable failure.
5. **Escalation** — what happens when the loop cannot succeed on its own.

### Article III — Evaluators are mandatory
A loop without an evaluator is an open loop, and an open loop is a latent incident. If the only "evaluator" is "it didn't throw," that is recorded as a **gap**, not a pass. Evaluators are defined by the Evaluator Standard.

### Article IV — Irreversible actions require a gate
Any action that is outward-facing or hard to reverse (sending, publishing, charging, deleting, dispatching to a partner) requires an explicit gate: a human approval, a dry-run preview, or a durable authorization. Gates are part of the loop, not an afterthought.

### Article V — Observability is part of done
A loop is not complete until its state is observable: a status field, a structured log, a cost/usage event, or a metric. "We would have to read the code to know what happened" means the loop is unobservable and therefore unfinished.

### Article VI — Contracts at every distributed seam
Where a loop crosses into a system owned by someone else, the seam is a **contract** (see the Contracts Framework). The contract is documented, versioned, and conformance-checked. A distributed seam with no registered contract is a gap.

### Article VII — Brain lockstep
The brain is the source of truth for how the system behaves. A change to a loop, contract, or boundary is not done until the brain reflects it. Documentation drift is treated as a defect, surfaced by `/brain-health` and repaired by `/update-brain`.

### Article VIII — Gaps are first-class
An honest "this loop has no evaluator / no escalation / no conformance check" is more valuable than a confident omission. Gaps are recorded in the gap matrix and carried until closed; they are never silently dropped.

## Conformance
A repository conforms to this Constitution when:
- Every documented loop names all five parts (or marks missing parts as gaps).
- Every distributed seam has a registered contract.
- Every irreversible action has a gate.
- The brain is in lockstep with the code (validation is green or gaps are documented as non-blocking).

## Relationship to other standards
This Constitution is the apex. The Evaluator Standard, Runtime Loop Standard, Loop-First PRD Standard, Contracts Framework, ADR Framework, and Repository Classification Standard are its implementing details. Where they conflict, this document wins.

# Loop-First PRD Standard

> Vendor-neutral. Defines how to specify new work as loops and outcomes rather than feature checklists. Used by `/plan-feature` and `/architect`.

## Principle
A PRD describes **outcomes and the loops that achieve them**, not a list of screens or functions. If a requirement cannot be phrased as "this loop should reliably produce this outcome, verified by this evaluator," it is under-specified.

## Required sections

### 1. Outcome
One sentence a non-engineer can verify. "A qualified prospect becomes a live preview site its owner can see."

### 2. Loops
For each loop the feature adds or changes:
- **Goal** — the outcome slice this loop owns.
- **Executor** — what does the work.
- **Evaluator** — how success is decided (cite the Evaluator Standard level).
- **Retry** — recoverable-failure behavior.
- **Escalation / gate** — human approval or dry-run for irreversible steps.
- **Observability** — what state/field/log proves it happened.
- **Runtime states** — which canonical states the work item moves through.

### 3. Contracts touched
Any distributed seam this work reads or writes, with a link to the contract entry. New seams require a new contract before implementation.

### 4. Gaps accepted
What this version intentionally does NOT do (missing evaluator, deferred escalation), recorded so it lands in the gap matrix instead of being forgotten.

### 5. Foundation check
One paragraph: does this lay a foundation to build ON, or one that forces a rebuild later? Prefer the durable approach even at higher upfront cost.

## Anti-patterns
- A PRD that lists UI without naming the outcome.
- A loop with no evaluator ("just call the API").
- An irreversible action with no gate.
- A new partner payload with no contract entry.

## Output
A Loop-First PRD is a planning artifact. It becomes ADRs (for decisions), contract entries (for seams), and loop-register rows (for the loops) as it is implemented.

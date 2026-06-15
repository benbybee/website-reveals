# ADR Framework

> Vendor-neutral. Defines how architectural decisions are recorded. Concrete ADRs live in `brain/decisions/`.

## What an ADR is
An **Architecture Decision Record** captures one decision that shapes the system: a structural choice, a contract change, a tier change, a foundational trade-off. It records the decision *and the context that forced it*, so a future maintainer understands why — not just what.

## When to write one
- Choosing or changing a distributed contract or its locality.
- Promoting/demoting the repository's tier.
- A foundational trade-off where a faster path was rejected for a more durable one (or vice-versa, with the debt named).
- A loop's evaluator, gate, or escalation model is established or changed.
- Anything a future engineer would otherwise re-litigate.

## Format
Each ADR is one file: `NNNN-kebab-title.md`.

```
# NNNN — Title
- Status: proposed | accepted | superseded by NNNN | deprecated
- Date: YYYY-MM-DD
- Deciders: roles/people
- Tier impact: none | promotes | demotes
- Contracts touched: links to brain/contracts entries, or none

## Context
The forces at play: constraints, the problem, what made a decision necessary.

## Decision
What was chosen, stated plainly.

## Consequences
What becomes easier, what becomes harder, what debt is accepted, what must be revisited.

## Alternatives considered
Each option and why it was rejected.
```

## Lifecycle
- ADRs are append-only. A reversed decision gets a NEW ADR that supersedes the old one; the old one is marked `superseded by NNNN`, never deleted.
- Numbering is monotonic. Gaps are fine; reuse is not.

## Relationship to the brain
An ADR explains *why* the current state is what it is. The brain's `current-state` and `decisions/` index link the two: current-state says what is true now; ADRs say how it got that way.

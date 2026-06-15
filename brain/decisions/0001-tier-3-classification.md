# 0001 — Classify Website Reveals as Tier 3

- Status: accepted
- Date: 2026-06-11
- Deciders: operator (confirmed during brain bootstrap)
- Tier impact: establishes Tier 3
- Contracts touched: all (registry created)

## Context
The Universal Repo Brain Bootstrap requires an operator-chosen tier ([Repository Classification Standard](../standards/repository-classification-standard.md)); the tier is never inferred. WR sends payloads SiteLaunchr validates against a `.strict()` schema it owns, consumes SL callbacks, and emits lifecycle events Dispatchr consumes. A version change on either side of those seams can break the other.

## Decision
Website Reveals is **Tier 3 — distributed participant**. It installs the full Contracts Framework, a contracts registry with `distributed remote` seams, the distributed maintenance doctrine, and `/cross-repo-review` as a first-class command.

## Consequences
- Easier: cross-repo changes have a registry and a review protocol; partner seams are explicit and conformance-checked.
- Harder: seam changes now require an ADR + `/cross-repo-review` + coordinated deploy, not a unilateral edit.
- The maintenance engine must account for the fact that local tooling cannot observe partner repos.

## Alternatives considered
- **Tier 2 (self-contained service):** rejected — it would treat SiteLaunchr/Dispatchr as mere vendor APIs, hiding the co-ownership and the coordinated-deploy risk that actually exists.
- **Tier 1:** rejected — WR has multiple live external runtime seams.

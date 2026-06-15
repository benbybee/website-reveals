# Contracts Framework

> Vendor-neutral. Defines how a distributed seam is registered, versioned, and conformance-checked. Applies to Tier 3 repositories. Concrete contracts live in `brain/contracts/`.

## What is a contract
A **contract** is a seam where this repository and a separately-owned system depend on a shared agreement: a request payload, an event shape, a callback, an auth scheme. The agreement is partly enforced in code that lives in **another repo**, so it must be documented here and kept in sync deliberately.

## Required fields
Every registered contract MUST document:

| Field | Meaning |
|---|---|
| **Name** | Stable identifier for the seam. |
| **Owner** | Which side defines the schema / is authoritative for the shape. |
| **Consumers** | Which side(s) read it. |
| **Direction** | Outbound (we call them) / inbound (they call us). |
| **Version** | Current contract version or the doctrine that governs change (e.g. additive-only). |
| **Lifecycle** | Draft → active → deprecated → retired, and where the seam currently sits. |
| **Change events** | What kinds of change are allowed without breaking, and what requires coordination. |
| **Conformance checks** | The concrete checks (validators, tests, signature verification) that prove a payload conforms — and where they live. |
| **Failure / retry / escalation** | What happens on a non-conforming or failed exchange: retried? isolated? dropped? escalated to a human? |
| **Locality** | `distributed remote` for a co-owned partner seam; `vendor` for a third-party API; `local` for in-repo. |

## Locality and its consequences
- **`distributed remote`** — the other side is a partner repo that the local map-builder **cannot observe**. Conformance is proven by the registered checks plus a manual `/cross-repo-review` before either side ships a change to the seam.
- **`vendor`** — a third-party API. Documented as an outbound dependency; changes are driven by the vendor's changelog, not co-owned.

## Conformance doctrine
1. Outbound payloads are produced by a single mapper and validated by a single validator. No seam payload is hand-assembled at the call site.
2. Inbound payloads are authenticated (signature + freshness window where applicable) and mapped through a single classifier before touching state.
3. The signed/validated bytes are the sent/received bytes — never re-serialize after signing.
4. A dedup/idempotency key makes every exchange safe to repeat.

## Change protocol (distributed remote)
1. Propose the change as an ADR.
2. Run `/cross-repo-review` to reason about both sides of the seam from the registry (the local tools cannot read the partner repo).
3. Prefer additive, backward-compatible changes; a breaking change requires coordinated deploys documented in the contract's change-events section.
4. Update the contract entry and conformance checks in the same change.

## Registration
Each contract is one file in `brain/contracts/`, following `_TEMPLATE.md`. The contracts registry index (`brain/contracts/README.md`) lists every seam, its locality, and its lifecycle state.

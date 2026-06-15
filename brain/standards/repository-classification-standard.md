# Repository Classification Standard

> Vendor-neutral. Defines the tiers a repository can occupy and what each tier installs. The tier is chosen by the operator, never inferred.

## Why tiers exist
The maintenance burden and the brain's shape depend on how connected a repository is. A self-contained library does not need a distributed-contracts maintenance engine; a service that participates in cross-repo workflows does. Tiers make that explicit.

## The tiers

### Tier 1 — Isolated
A self-contained library, CLI, or app with no first-class runtime dependence on a separately-owned service. No external partner contracts.
- Installs: standards, brain core, ADRs, loop register, slash commands, local maintenance (map-changes can fully observe the world).

### Tier 2 — Self-contained service
A deployable service that owns its own data and may call third-party **vendor** APIs, but does not participate in a multi-repo workflow where a *partner repo* depends on its events/payloads (or vice-versa).
- Installs: everything in Tier 1, plus an integration register for vendor seams. Vendor seams are documented but treated as outbound dependencies, not co-owned contracts.

### Tier 3 — Distributed participant
A service that **owns or participates in contracts with separately-owned partner repositories** — it emits events others consume, or sends payloads others validate, or consumes callbacks others emit. Correctness depends on agreements that live partly in another repo.
- Installs: everything in Tier 2, plus the full **Contracts Framework**, a contracts registry with `locality: distributed remote` seams, the distributed maintenance doctrine (map-changes **cannot** observe partner repos), and the `/cross-repo-review` command as a first-class seam check.

## Decision criteria (operator answers)
A repository is **Tier 3** if any of these are true:
- It POSTs payloads a partner repo validates against a schema it does not control.
- It emits lifecycle events a partner repo consumes.
- It consumes callbacks/webhooks a partner repo emits.
- A version bump on either side can break the other.

If none are true but it calls vendor APIs → **Tier 2**. If it has no external runtime seams → **Tier 1**.

## Tier obligations
| Obligation | T1 | T2 | T3 |
|---|---|---|---|
| Standards + brain core | ✓ | ✓ | ✓ |
| Loop register + gap matrix | ✓ | ✓ | ✓ |
| Vendor integration register | — | ✓ | ✓ |
| Contracts registry (co-owned) | — | — | ✓ |
| Distributed maintenance doctrine | — | — | ✓ |
| `/cross-repo-review` | — | — | ✓ |

## Re-classification
Tier is reviewed whenever a new external seam is added or removed. Adding the first partner contract promotes a repo to Tier 3; this is an ADR-worthy event.

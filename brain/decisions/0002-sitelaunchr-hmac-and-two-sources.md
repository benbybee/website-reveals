# 0002 — One HMAC scheme, two SL source identities

- Status: accepted (retroactive — records existing implementation)
- Date: 2026-06-11 (decision predates the brain)
- Deciders: engineering
- Tier impact: none (within Tier 3)
- Contracts touched: [C1](../contracts/c1-sitelaunchr-builds-wr.md), [C2](../contracts/c2-sitelaunchr-builds-wr-template.md), [C3](../contracts/c3-sitelaunchr-conversions.md), [C4](../contracts/c4-sitelaunchr-callbacks.md)

## Context
Two WR spines dispatch to SiteLaunchr: client onboarding and the Template GTM machine. They need separate credentials, rate limits, and template-selection behavior at SL, but should not each invent a different signing scheme.

## Decision
Use **one HMAC envelope** — `HMAC_SHA256(secret, "${timestamp}.${rawBody}")` over the exact serialized bytes, sent as `x-source-id`/`x-api-key`/`x-timestamp`/`x-signature` ([`lib/sitelaunchr.ts`](../../lib/sitelaunchr.ts)) — across **two source identities**: `wr` (onboarding) and `wr-template` (GTM), each with its own SL sources row, API key, and HMAC secret. Inbound callbacks verify the same scheme plus a ±300s freshness window.

## Consequences
- Easier: one signer/verifier ([Pattern P2](../standards/pattern-library.md)); a new spine = a new source id + creds, not a new protocol.
- Constraint: the onboarding path carries the `kura{}` block at intake (owner known); the template path defers owner to the Stage-2 conversion (C3). This asymmetry is intentional and must be preserved.
- Sign-once/send-exact is load-bearing: re-serializing after signing breaks the signature.

## Alternatives considered
- **Separate signing schemes per spine:** rejected — duplicate crypto, drift risk.
- **Single shared source id:** rejected — no separate rate limits/credentials/template behavior, and a leak of one would compromise both.

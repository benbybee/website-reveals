---
description: Reason about both sides of a distributed seam from the contracts registry (the local tools cannot read partner repos).
---

This is the Tier 3 seam-safety command. Use it BEFORE shipping any change to a SiteLaunchr / Dispatchr / Kura-via-SL payload, auth, or response handling. Target: `$ARGUMENTS`.

## Hard fact
The local repository and tooling **cannot observe the partner repos** (SiteLaunchr, Dispatchr, Kura). The [contracts registry](../../brain/contracts/README.md) is the ONLY shared map. Treat it as the source of truth for the partner's expectations and reason explicitly about what you cannot see.

## Procedure
1. **Identify the seam(s)** — which `brain/contracts/` entries does the change touch? If a new seam, it needs a contract entry first.
2. **Both sides** — for each seam, state:
   - what WR sends/expects (cite the real mapper/validator/classifier file),
   - what the partner is documented to require/emit (from the contract entry),
   - what could differ that local tests CANNOT catch (schema strictness, new required field, slug vocabulary, auth window).
3. **Compatibility class** — additive/backward-compatible vs. breaking. Breaking ⇒ coordinated deploy required; document the order (who ships first).
4. **Conformance** — are the contract's conformance checks still valid after the change? Update them in the same change.
5. **Change protocol** — require an ADR; update the contract entry's version/change-events; note the coordinated-deploy plan.

## Output
- Per-seam compatibility verdict (safe / additive / **breaking**).
- The explicit "things only the partner repo can confirm" list (hand to the partner owner).
- Required: ADR id, contract-entry edits, deploy ordering, and whether to BLOCK the merge pending partner confirmation.

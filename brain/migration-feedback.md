# Migration Feedback — Website Reveals (first real Universal Repo Brain Bootstrap)

> Captured after the Tier 3 brain migration committed as `b51686e` (62 files, 2100 insertions, 9/9 validation green). Purpose: feed lessons back into the Universal Repo Brain Bootstrap **before** it is applied to SiteLaunchr, Dispatchr, or Relay. This doc records experience; it does **not** change the bootstrap (that requires explicit approval and happens in the bootstrap's home, not here).

## Snapshot of what was migrated
- Canonical `AGENTS.md` + `CLAUDE.md` adapter; `brain/` (51 docs + validator); 8 slash commands.
- **5 distributed contracts** (C1–C5), **8 loops** (L1–L8), **8 standards**, **5 ADRs**, **18 gaps** recorded.
- Validation tool green 9/9; it caught one real defect mid-run (a referenced-but-missing C5 contract file) before commit.

---

## Answers to the review questions

### 1. What worked well
- **Operator-gated tier selection.** The bootstrap refused to infer the tier and made the operator choose. WR was genuinely ambiguous (real partner contracts + many vendor APIs), so forcing the choice was correct, not bureaucratic.
- **Discovery-first, code-as-reality.** A parallel discovery pass over the real code (routes, tasks, migrations, mappers) grounded every brain claim. Authoring from a discovery digest + primary-source reads of the seam files produced accurate contracts.
- **The validation tool earned its place immediately.** It failed the first run on a real defect — C5 was referenced in 5 docs but the contract file didn't exist — and blocked a broken commit. Validation-as-tooling is not ceremony.
- **Pattern Library fit reality.** WR's existing code already used single-mapper/single-validator, sign-once/send-exact, idempotency keys, dry-run-before-send, and fan-out — the bootstrap's pattern vocabulary mapped cleanly onto what engineers had already built.
- **Canonical/adapter split held.** `AGENTS.md` canonical + `CLAUDE.md` thin adapter, enforced by a validator check, gave a clean "one source of truth" without fighting the global user instructions.
- **Gap matrix produced real, actionable risk.** 18 gaps, severity-ranked, each tied to a loop/contract — not filler.

### 2. What was confusing / required operator judgment
- **Tier 2 vs Tier 3 is a whole-repo label over a per-seam reality.** WR is "Tier 3 for 3 partner seams, Tier 2 for 11 vendor integrations." Resolving this required explaining that tier = the MAX over seams and that the vendor/contract split carries the nuance.
- **Kura is not a direct WR contract.** The bootstrap's task list named "WR → Kura" as an expected contract; the code showed Kura is reached **only** via SL `/api/conversions` (a mediated/transitive seam). Modeling it correctly (downstream-of-SL note, not a WR-owned contract) was a judgment call the expectation list got wrong.
- **Two contracts on one endpoint.** `wr` and `wr-template` both POST `/api/builds` with different source identities and credentials. Deciding these are two contracts (C1, C2), not one, required judgment the bootstrap didn't pre-answer.
- **Is an observability seam a "contract"?** Dispatchr (C5) is fire-and-forget with no conformance check, retry, or escalation — yet it's a real distributed seam. The Contracts Framework assumes contracts have those; representing C5 required bending the template.
- **Neutrality scope.** "Vendor-neutral scan for doctrine/template docs" was ambiguous about whether slash commands count. Judgment: scope neutrality to `brain/standards/**` only and exempt commands (a `/cross-repo-review` command MUST name partners to be useful).
- **Retroactive ADRs.** Most architectural decisions predated the brain. The bootstrap didn't say "write retroactive ADRs for existing decisions"; doing so (ADRs 0002–0005) was a judgment call to preserve the "why."
- **Open loop vs missing evaluator.** The Constitution says every loop needs an evaluator; L4 (Dispatchr) legitimately has none by design. Marking it a gap (G-L4) felt slightly wrong — it's an *accepted* open loop, not an omission.

### 3. Bootstrap assumptions that were CORRECT
- Tier must be operator-chosen, never inferred.
- A Tier 3 repo needs a contracts registry because **local tooling cannot observe partner repos** — this was the single most load-bearing assumption and it held completely.
- Portable doctrine should be vendor-/implementation-neutral — the standards dropped in clean and passed both neutrality scans.
- Every loop should declare goal/executor/evaluator/retry/escalation — this surfaced WR's real open loops and missing gates.
- Dry-run/gate before irreversible actions is a universal need — WR already had it for push and mail; the doctrine matched.

### 4. Bootstrap assumptions that were WRONG or INCOMPLETE
- **"One contract per partner endpoint."** Reality: one endpoint can host multiple contracts keyed by source/auth identity (C1 vs C2 on `/api/builds`). Needs a **multi-identity seam** pattern.
- **"Partner seams are direct."** Reality: Kura is a **mediated/transitive** seam (WR→SL→Kura). Needs a transitive-contract pattern and guidance that the "expected contracts" list must be confirmed from code, not assumed.
- **"Contracts have conformance checks + retry + escalation."** Reality: an **observability-only / no-delivery-guarantee** seam (C5) has none by design. Needs an explicit contract sub-type so this isn't modeled as a broken contract.
- **Contract lifecycle is `draft→active→deprecated→retired`.** Reality: C4 is **active for status but partially awaiting the partner** (cost fields documented, WR-ready, SL hasn't shipped). Needs a **`partial / awaiting-partner`** lifecycle state.
- **"No evaluator = gap."** Conflates an intentionally-open observability loop with a real omission. Needs an **`accepted-open`** loop status distinct from a missing-evaluator gap.
- **Neutrality scope was under-specified** (commands vs standards), forcing a local decision.
- **No prescription for retroactive ADRs** on a brownfield repo, which is the common case.

### 5. Missing LOOP patterns exposed by WR
- **Fan-out worker-pool with claim-stale recovery** (the enrich parent → child batches, [L2](./loops/ingestion-scrape.md) / [ADR 0003](./decisions/0003-enrich-fan-out.md)). The Runtime Loop Standard covers claim-stale recovery abstractly, but the loop taxonomy lacks a named parallel-batch loop pattern.
- **Multi-arm loop sharing one evaluator doctrine** ([L3 build dispatch](./loops/build-dispatch.md) has four executor arms — onboarding build, GTM push, conversion, mail — sharing the same gate/idempotency doctrine). The bootstrap assumed one executor per loop.
- **Async human-gate via an external channel** (Telegram approval, [L6](./loops/ai-wizard-generation.md)) — the evaluator is a human acting through a chat surface. Worth naming as an evaluator placement pattern.

### 6. Missing CONTRACT patterns exposed by WR
- **Multi-identity single-endpoint** (C1/C2).
- **Mediated / transitive contract** (C3: WR→SL→Kura).
- **Observability-only / no-delivery-guarantee seam** (C5).
- **Inbound-callback paired with outbound-request** (C1/C2 outbound ↔ C4 inbound) — the bootstrap gave no guidance on whether a request+callback pair is one contract or two. WR split them; a rule would help.
- **Documented-but-not-yet-shipped extension** (C4 cost fields) — needs the `partial / awaiting-partner` lifecycle state above.

### 7. Missing SLASH COMMAND behavior exposed
- `/cross-repo-review` is the right idea but can only reason from the registry; it cannot verify the partner. Its most useful output turned out to be a **"things only the partner can confirm" hand-off list** — the bootstrap should formalize that as a required artifact the command emits.
- **No tier-reclassification command.** The Classification Standard says tier is reviewed when a seam is added/removed, but there's no command to drive it.
- **No gap-triage command.** The gap matrix is rich (18 entries) but nothing converts gaps into prioritized work; a `/gap-triage` would close the loop.
- `/update-brain` and `/brain-health` had no gaps — they worked as intended.

### 8. Maintenance engine limitations exposed
- **Structural half-blindness.** For a Tier 3 repo the maintenance engine can verify everything local and nothing remote. It documents this and substitutes the registry + `/cross-repo-review`, but there is **no mechanism to detect partner-side drift** (e.g., SL silently tightening its schema). The missing piece is a **contract canary** — a periodic real probe against the partner's sandbox — which the bootstrap does not provide.
- **No reminder for awaiting-partner extensions.** C4's cost fields could ship on the SL side and WR would not notice; nothing prompts a re-check. An `awaiting-partner` state plus a maintenance reminder would close this.
- Maintenance currently relies entirely on a human remembering to run `/cross-repo-review` at the right moment.

### 9. Tier 2 vs Tier 3 classification issues exposed
- **Tier is whole-repo; reality is per-seam.** WR is Tier 3 because of 3 seams while 11 integrations are Tier 2 vendor seams. The standard handles this via locality (`distributed remote` vs `vendor`), but the single tier label needs the explicit rule: **tier = MAX over seams; the registry/integration split carries the per-seam truth.**
- **An "expected" partner contract can evaporate on inspection.** Kura was expected to be a WR contract and turned out to be mediated by SL. The classification process must treat the partner list as a hypothesis to confirm against code, not a given.

### 10. Should the bootstrap be updated before migrating SiteLaunchr?
**Yes — and SiteLaunchr is exactly the repo that will stress the gaps WR exposed.** SL is the *other side* of C1–C4 and the *mediator* to Kura, so it will hit, from the opposite direction and at higher density: multi-identity inbound contracts (receiving `wr` + `wr-template`), the mediated Kura contract (for SL this is a **direct** contract, unlike WR), the request/callback split, and likely several observability seams. The contract-pattern additions below are highest-leverage precisely because SL is contract-dense. The improvements are **additive** (new patterns, one lifecycle state, command formalization, neutrality scoping) and do **not** require reworking WR's brain.

---

## Migration feedback summary
The bootstrap's core bet — operator-chosen tier + discovery-grounded brain + a contracts registry that substitutes for the partner-repo blind spot — was validated by a real Tier 3 migration. It produced an accurate, navigable, self-validating brain and surfaced 18 real gaps. The friction was entirely in the **contract modeling vocabulary**: WR's seams are richer than the bootstrap's "one direct contract per partner, with conformance + retry" template (multi-identity, mediated, observability-only, awaiting-partner). The loop and standards machinery fit reality well; the contracts machinery needs a few more named shapes.

## Bootstrap improvements recommended (apply in the bootstrap's home, not here)
1. **Contract patterns:** add multi-identity single-endpoint, mediated/transitive, and observability-only/no-guarantee seam types to the Contracts Framework.
2. **Contract lifecycle:** add a `partial / awaiting-partner` state.
3. **Loop patterns:** add fan-out-worker-pool-with-claim-stale-recovery, multi-arm-loop, and async-human-gate to the Pattern Library / loop taxonomy.
4. **Loop status:** distinguish `accepted-open` from `missing-evaluator` so intentional observability loops aren't false gaps.
5. **Classification rule:** state explicitly that tier = MAX over seams and that the expected-partner list is a hypothesis to confirm from code.
6. **Neutrality scope:** specify that neutrality scans cover portable doctrine (`standards/`) only; command files are repo-operational.
7. **Brownfield ADRs:** prescribe retroactive ADRs for pre-existing decisions.
8. **Commands:** formalize `/cross-repo-review`'s "partner-only-can-confirm" output artifact; add `/reclassify-tier` and `/gap-triage`.
9. **Maintenance:** add an optional **contract canary** (sandbox probe) and an awaiting-partner re-check reminder to cover the partner-drift blind spot.

## Website Reveals-specific follow-ups (gap matrix)
- **G-C5 (High):** durable Dispatchr delivery (outbox + drain, or retrying task).
- **G-C4 (High, cross-repo):** real cost attribution — coordinate with SL to emit `cost_usd`/`usage`. **Naturally resolved during the SL migration** via `/cross-repo-review`.
- **G-AI1 (Med):** delete or re-integrate the two never-dispatched AI tasks.
- **G-BUD1 (Med):** per-campaign Apify budget gate.
- **Reconcile:** billing markup documented as 2.5× vs a code path referencing 1.25× ([billing feature](./features/billing.md), [handoff](./handoff.md)).
- Full list: [gap matrix](./gap-matrix.md).

## Whether to proceed to SiteLaunchr
**Proceed — but update the bootstrap first.** Order: (1) apply the contract-pattern + lifecycle + classification improvements to the bootstrap; (2) migrate SiteLaunchr with the upgraded bootstrap; (3) during the SL migration, use `/cross-repo-review` to close the shared C1–C4 seams and resolve **G-C4** (cost reporting) from both sides at once. WR's brain needs no rework to proceed.

## Whether changes should feed into Kura / the bootstrap first
**Yes — the nine improvements above are bootstrap-level doctrine, not WR-level**, so they belong in the bootstrap's home (Kura / the bootstrap repo), applied before the SL migration. Per the operator's constraint, this document only **recommends** them; no bootstrap change has been made from this repo.

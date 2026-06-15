# L3 — Build Dispatch Loop

> The widest loop: it covers four dispatch arms that share the same doctrine (single mapper/validator, sign-once, idempotent dedup, per-item isolation, classified outcomes).

**Goal:** Get a build/preview/conversion/postcard delivered to its partner and reflected back into WR state.

## Arms
| Arm | Executor | Contract | Dedup key |
|---|---|---|---|
| Onboarding build | `dispatchBuild` (`lib/sitelaunchr.ts`) | [C1](../contracts/c1-sitelaunchr-builds-wr.md) | `external_id` |
| GTM push | `pushBuilds`/`postBuild` (`lib/templates/sl/adapter.ts`) | [C2](../contracts/c2-sitelaunchr-builds-wr-template.md) | prospect `source_id` |
| Conversion (Kura) | `postConversion` (`lib/templates/sl/convert.ts`) | [C3](../contracts/c3-sitelaunchr-conversions.md) | `external_id` |
| Direct mail | `tpl-mail-campaign` (`lib/templates/mail/*`) | Lob / Click2Mail (vendor) | `tpl_mailings UNIQUE(prospect_id)` |

**Evaluator (L2):**
- SL arms: `validateBuildPayload` / `validateConversionInput` before send; response gate after. Conversion classifies the response into a `ConversionOutcome` ([Pattern P10](../standards/pattern-library.md)).
- Mail arm: Lob address-verify deliverability gate (only `deliverable` / `deliverable_unnecessary_unit` pass); Click2Mail submit-status + cost gate. A `dryRun` previews eligible count + estimated cost for operator sign-off ([Pattern P6](../standards/pattern-library.md)).

**Retry:** C2 honors 429 `retry-after` up to 3×. All arms idempotent on their dedup key. Mail is one-card-per-prospect-ever via the UNIQUE constraint.

**Escalation / gate:** per-item isolation (one bad prospect never aborts the batch). Failed build → operator review (`build_failed`/error surfaced). Conversion retryable outcomes → **manual re-fire** (G-C3). Mail partial-send → manual resume (G-MAIL1). The push/mail real send is gated behind a dry-run.

**Approval gate:** GTM push and mail both expose a dry-run; conversion is an explicit admin route action that captures owner data.

**Observability:** `tpl_sl_batches` (per-push, `sl_response`), `build_jobs`, `tpl_mailings` (status, cost, tracking), `BuildResult`/`ConversionOutcome` return shapes, Dispatchr `build.dispatched`.

**Runtime states:** build item `queued|running`→running, `succeeded`/`live`→succeeded, `failed|canceled`→failed (mapped by [`callbackStatus.ts`](../../lib/templates/sl/callbackStatus.ts) — see [C4](../contracts/c4-sitelaunchr-callbacks.md)).

**Gaps:** no SL-side conformance probe / template-slug feedback (G-C2); conversion synchronous in-route with no retry loop (G-C3); mail partial-send recovery manual (G-MAIL1). See [gap matrix](../gap-matrix.md).

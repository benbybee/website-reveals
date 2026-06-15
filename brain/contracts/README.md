# Contracts Registry — Website Reveals

> Tier 3 distributed participant. This registry is the source of truth for every seam where Website Reveals (WR) depends on, or is depended on by, a **separately-owned** system. Governed by [the Contracts Framework](../standards/contracts-framework.md).
>
> **Local tooling cannot observe partner repos.** Conformance at a `distributed remote` seam is proven by the checks listed in each entry plus a manual [`/cross-repo-review`](../../.claude/commands/cross-repo-review.md) before either side ships a seam change.

## Partners
- **SiteLaunchr (SL)** — the build engine. WR sends build requests and conversions; SL sends status callbacks. SL owns the `/api/builds` and `/api/conversions` schemas (`.strict()`).
- **Dispatchr** — Ben's Mission Control. Observes WR's intake/build lifecycle via outbound webhook events. WR owns the event shape.
- **Kura** — the site CMS/portal. **WR has no direct Kura seam**; the Kura promote is dispatched by SL when WR posts a conversion. Documented here as a downstream-of-SL note, not a WR-owned contract.

## Registered contracts
| # | Contract | Direction | Partner | Locality | Lifecycle | Auth |
|---|---|---|---|---|---|---|
| C1 | [SL `/api/builds` — `wr` onboarding source](./c1-sitelaunchr-builds-wr.md) | outbound | SiteLaunchr | distributed remote | active | HMAC (`wr`) |
| C2 | [SL `/api/builds` — `wr-template` GTM source](./c2-sitelaunchr-builds-wr-template.md) | outbound | SiteLaunchr | distributed remote | active | HMAC (`wr-template`) |
| C3 | [SL `/api/conversions` — Stage-2 / Kura handoff](./c3-sitelaunchr-conversions.md) | outbound | SiteLaunchr → Kura | distributed remote | active | HMAC (`wr-template`) |
| C4 | [SL → WR build status callbacks](./c4-sitelaunchr-callbacks.md) | inbound | SiteLaunchr | distributed remote | active (cost fields: partial) | HMAC verify ±300s |
| C5 | [WR → Dispatchr lifecycle events](./c5-dispatchr-lifecycle.md) | outbound | Dispatchr | distributed remote | active | shared secret header |

## Locality legend
- **distributed remote** — co-owned with a partner repo the local map-builder cannot read. Change protocol: ADR → `/cross-repo-review` → coordinated deploy.

## Shared auth scheme (C1–C4)
All SL seams use the same HMAC envelope: `signature = HMAC_SHA256(secret, "${timestamp}.${rawBody}")`, sent as `x-source-id`, `x-api-key`, `x-timestamp`, `x-signature`. The signed bytes are the sent bytes (sign-once, send-exact — [Pattern P2](../standards/pattern-library.md)). Inbound callbacks (C4) verify the same scheme plus a ±300s freshness window. Single signer/verifier: [`lib/sitelaunchr.ts`](../../lib/sitelaunchr.ts) `signPayload` / `verifyCallback`.

## Conformance status at a glance
| Contract | Outbound mapper | Validator | Conformance check | Gap |
|---|---|---|---|---|
| C1 | `lib/sitelaunchr-mapper.ts` | inline (throws on non-2xx) | `dispatchBuild` 2xx + build_id/status present | no schema-level dry-run vs SL |
| C2 | `lib/templates/sl/toBuildPayload.ts` | `validateBuildPayload` | dry-run preview + `tpl_sl_batches` | no automated SL-side conformance probe |
| C3 | `lib/templates/sl/convert.ts` | `validateConversionInput` | `classifyConversionResponse` | retryable outcomes not auto-retried (manual re-fire) |
| C4 | — | `verifyCallback` (HMAC + freshness) | `slStatusToStage` classifier | cost fields (`cost_usd`/`usage`) not yet emitted by SL |
| C5 | `lib/dispatchr-webhook.ts` (`WrEvent`) | none (best-effort) | none | **fire-and-forget: no delivery guarantee, no retry, no escalation** |

See the [gap matrix](../gap-matrix.md) for the full list and severity.

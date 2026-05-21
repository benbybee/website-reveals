# SL → WR cost reporting contract

## Why

WR's current `build_jobs.cost_usd` is a fictional estimate derived from build
duration and a hardcoded base rate. With v4 builds running 60-90 minutes, the
formula hits its clamp ceiling on every build, so cost_usd is now a flat
$8.80 and the variance between fast and slow builds is invisible. Real cost
attribution requires SL because only SL knows which Anthropic API calls
belong to which `build_id`.

## What changes for SL

When SL fires the `phase=live` callback for a build, include **either** of
the following on the same POST body. WR's `/api/sl-callback` reads them and
overrides the duration-based estimate.

### Preferred: SL-computed cost (one field)

```jsonc
{
  // ...existing fields (build_id, external_id, phase, site_url, ...)
  "cost_usd": 11.42
}
```

`cost_usd` is the final USD amount SL wants WR to bill against. Includes any
SL-side margin or fees. WR stores verbatim; `BILLING_MARKUP` (2.5×) applies
on top for client invoicing.

### Alternative: raw token counts

```jsonc
{
  // ...existing fields
  "usage": {
    "model": "claude-sonnet-4-6",
    "input_tokens": 12345,
    "output_tokens": 6789,
    "cache_creation_input_tokens": 2000,
    "cache_read_input_tokens": 8500
  }
}
```

WR multiplies tokens by current Anthropic per-MTok pricing in
`lib/anthropic-pricing.ts`. This path stores token counts in
`build_jobs.input_tokens` / `output_tokens` / `cache_*_tokens` so we have
an audit trail.

Use this shape when you want WR to track at-cost Anthropic spend (no SL
margin baked in). Switching margin policy later means just changing
`BILLING_MARKUP` on WR's side.

### Both shapes accepted

If SL sends both `cost_usd` AND `usage`, the explicit `cost_usd` wins. Token
columns get populated either way.

## Behavior until SL ships this

Until SL adds the field(s), WR falls back to the duration estimate
([lib/sitelaunchr.ts:estimateBuildCost](../../lib/sitelaunchr.ts)) — the
same formula that's been running, with the same flat-$8.80 clamp behavior
on long builds. So shipping this on WR is a no-op until SL shows up.

## Confirming it landed

Once SL deploys, the next `phase=live` callback should write a non-clamped
value to `build_jobs.cost_usd`. Check the admin billing page — the
**API COST** column should start varying across builds again.

If SL uses a model name we don't recognize, `lib/anthropic-pricing.ts`
falls back to Sonnet 4.6 rates and logs a console warning. Add new
entries to `MODEL_RATES` when SL adopts a new model.

import { computeCostFromTokens } from "../../anthropic-pricing";

// Resolve the real per-build USD cost SL now reports on a terminal wr-template
// callback (closes G-C4 for the template flow). cost_usd verbatim is preferred;
// otherwise price the token usage via anthropic-pricing. Tolerates both usage
// token-field spellings (SL sends cache_read_tokens / cache_creation_tokens; the
// pricing helper and the wr onboarding path use the *_input_tokens spelling).

export interface CallbackCostFields {
  cost_usd?: number | null;
  usage?: {
    model?: string | null;
    input_tokens?: number | null;
    output_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
    cache_read_input_tokens?: number | null;
    cache_creation_tokens?: number | null;
    cache_read_tokens?: number | null;
  } | null;
}

/** cost_usd (preferred) → priced usage → null when SL reported no cost. */
export function resolveBuildCostUsd(body: CallbackCostFields): number | null {
  if (typeof body.cost_usd === "number" && body.cost_usd >= 0) return body.cost_usd;
  const u = body.usage;
  if (!u) return null;
  const cacheCreate = u.cache_creation_input_tokens ?? u.cache_creation_tokens ?? null;
  const cacheRead = u.cache_read_input_tokens ?? u.cache_read_tokens ?? null;
  if (!(u.input_tokens || u.output_tokens || cacheCreate || cacheRead)) return null;
  return computeCostFromTokens(
    {
      input_tokens: u.input_tokens,
      output_tokens: u.output_tokens,
      cache_creation_input_tokens: cacheCreate,
      cache_read_input_tokens: cacheRead,
    },
    u.model,
  );
}

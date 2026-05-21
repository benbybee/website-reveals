/**
 * Anthropic API pricing per million tokens (USD), used to compute per-build
 * cost_usd from token counts that SL sends in its callback payload.
 *
 * Rates are per Anthropic's public pricing as of 2026. Cache write is 1.25×
 * the input rate, cache read is 0.1× the input rate (the same multipliers
 * apply across the Claude 4 family). Update when Anthropic changes pricing
 * or when SL adopts a new model.
 *
 * Fallback rate: if the callback's model name doesn't match anything in
 * MODEL_RATES we use SONNET_46 (the most likely model SL uses for builds).
 */

interface ModelRate {
  /** Per million input tokens, USD. */
  input: number;
  /** Per million output tokens, USD. */
  output: number;
}

// Sonnet 4.6 is the default — adjust here when SL switches models.
const SONNET_46: ModelRate = { input: 3.0, output: 15.0 };

const MODEL_RATES: Record<string, ModelRate> = {
  "claude-sonnet-4-6": SONNET_46,
  "claude-sonnet-4-5": { input: 3.0, output: 15.0 },
  "claude-opus-4-7": { input: 15.0, output: 75.0 },
  "claude-opus-4-6": { input: 15.0, output: 75.0 },
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4.0 },
  "claude-haiku-4-5": { input: 0.8, output: 4.0 },
};

const CACHE_WRITE_MULT = 1.25; // cache_creation pays this multiple of input
const CACHE_READ_MULT = 0.1;   // cache_read pays this multiple of input

export interface TokenUsage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

/**
 * Compute USD cost from token counts. Returns 0 when no tokens at all are
 * present — caller is responsible for choosing the fallback estimate path
 * in that case.
 *
 * Matches strict model name first; falls back to Sonnet 4.6 when the model
 * is missing or unrecognized (with a console warning so we notice new
 * models SL adopts).
 */
export function computeCostFromTokens(usage: TokenUsage, model?: string | null): number {
  const rate = (model && MODEL_RATES[model]) || SONNET_46;
  if (model && !MODEL_RATES[model]) {
    console.warn(`[anthropic-pricing] Unknown model "${model}" — falling back to Sonnet 4.6 rates`);
  }

  const input = usage.input_tokens || 0;
  const output = usage.output_tokens || 0;
  const cacheWrite = usage.cache_creation_input_tokens || 0;
  const cacheRead = usage.cache_read_input_tokens || 0;

  if (input + output + cacheWrite + cacheRead === 0) return 0;

  const cost =
    (input * rate.input +
      output * rate.output +
      cacheWrite * rate.input * CACHE_WRITE_MULT +
      cacheRead * rate.input * CACHE_READ_MULT) /
    1_000_000;

  return Math.round(cost * 10000) / 10000; // 4 decimal precision; build_jobs.cost_usd is NUMERIC(10,4)
}

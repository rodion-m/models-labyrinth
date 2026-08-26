import type { Offer, PricePoint, WorkloadProfile } from "./types.js";

export interface CostResult {
  estimated_cost_usd: number | null;
  missing_dimensions: string[];
  components: Record<string, number | null>;
  inputs: {
    input_tokens: number;
    output_tokens: number;
    cached_input_tokens: number;
    uncached_input_tokens: number;
    cache_write_tokens: number;
    reasoning_tokens: number;
    requests_per_task: number;
    context_tokens: number;
  };
}

export function estimateCost(offer: Offer, profile: WorkloadProfile): number | null {
  return estimateWorkloadCost(offer, profile).estimated_cost_usd;
}

export function estimateWorkloadCost(offer: Offer, profile: WorkloadProfile): CostResult {
  const cachedInputTokens = profile.input_tokens * profile.cached_input_ratio;
  const uncachedInputTokens = profile.input_tokens * (1 - profile.cached_input_ratio);
  const cacheWriteTokens = profile.cache_write_tokens ?? 0;
  const reasoningTokens = profile.reasoning_tokens ?? 0;
  const contextTokens = profile.input_tokens;
  const inputs = {
    input_tokens: profile.input_tokens,
    output_tokens: profile.output_tokens,
    cached_input_tokens: cachedInputTokens,
    uncached_input_tokens: uncachedInputTokens,
    cache_write_tokens: cacheWriteTokens,
    reasoning_tokens: reasoningTokens,
    requests_per_task: profile.requests_per_task,
    context_tokens: contextTokens,
  };
  const missing = new Set<string>();
  const components: Record<string, number | null> = {};
  if (profile.cached_input_ratio > 0 && profile.cache_write_tokens === undefined) {
    missing.add("cache_write_tokens");
  }

  const add = (dimension: string, units: number, required: boolean) => {
    if (units <= 0) return;
    const rate = rateFor(offer, dimension, contextTokens);
    if (rate === "ambiguous") {
      missing.add(dimension === "input" || dimension === "output" || dimension === "cache_read" || dimension === "cache_write" || dimension === "reasoning" ? `${dimension}_tier` : dimension);
      if (dimension === "input" || dimension === "output" || dimension === "cache_read" || dimension === "cache_write" || dimension === "reasoning") missing.add(dimension);
      components[dimension] = null;
      return;
    }
    if (rate === undefined) {
      if (required) {
        missing.add(dimension);
        components[dimension] = null;
      }
      return;
    }
    components[dimension] = rate(units);
  };

  add("input", uncachedInputTokens, uncachedInputTokens > 0);
  add("cache_read", cachedInputTokens, cachedInputTokens > 0);
  add("cache_write", cacheWriteTokens, cacheWriteTokens > 0);
  add("output", profile.output_tokens, profile.output_tokens > 0);
  add("reasoning", reasoningTokens, reasoningTokens > 0);
  add("request", 1, offer.pricing.some((point) => point.dimension === "request"));

  if (missing.size > 0) {
    return { estimated_cost_usd: null, missing_dimensions: [...missing].sort(), components, inputs };
  }
  const total = Object.values(components).reduce<number>((sum, value) => sum + (value ?? 0), 0) * profile.requests_per_task;
  return {
    estimated_cost_usd: Number(total.toPrecision(12)),
    missing_dimensions: [],
    components: Object.fromEntries(Object.entries(components).map(([key, value]) => [key, value === null ? null : Number(((value ?? 0) * profile.requests_per_task).toPrecision(12))])),
    inputs,
  };
}

function rateFor(offer: Offer, dimension: string, contextTokens: number): ((units: number) => number) | "ambiguous" | undefined {
  const points = offer.pricing.filter((value) => value.dimension === dimension);
  if (points.some((point) => point.kind === "scheduled" || (point.kind === "tiered" && point.tier?.type === "volume"))) {
    return "ambiguous";
  }
  const contextTiers = points.filter((point) => point.kind === "tiered" && point.tier?.type === "context");
  const matchingTiers = contextTiers.filter((point) => isApplicableContextTier(point, contextTokens));
  const applicable = matchingTiers.length > 0
    ? matchingTiers
    : points.filter((point) => point.kind === "fixed" || point.kind === "variable");
  if (applicable.some((point) => point.amount_usd_per_unit === null)) return undefined;
  const rates = applicable.flatMap((point) => {
    if (point.amount_usd_per_unit === null) return [];
    if (point.unit === "million_tokens") return [point.amount_usd_per_unit / 1_000_000];
    if (point.unit === "token" || point.unit === "request") return [point.amount_usd_per_unit];
    return [];
  });
  if (rates.length === 0) return undefined;
  const first = rates[0];
  if (rates.some((value) => Math.abs(value - first) > Math.max(1e-15, Math.abs(first) * 1e-9))) return "ambiguous";
  return (units: number) => units * first;
}

function isApplicableContextTier(point: PricePoint, contextTokens: number): boolean {
  if (point.kind !== "tiered" || !point.tier || point.tier.type !== "context") return false;
  const min = point.tier.min ?? 0;
  const max = point.tier.max;
  if (contextTokens < min) return false;
  if (max !== undefined && contextTokens >= max) return false;
  return true;
}

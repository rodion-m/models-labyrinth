import type { Offer, WorkloadProfile } from "./types.js";

export function estimateCost(offer: Offer, profile: WorkloadProfile): number | null {
  const input = priceFor(offer, "input");
  const output = priceFor(offer, "output");
  const cacheRead = priceFor(offer, "cache_read");
  const request = priceFor(offer, "request");
  if (profile.input_tokens > 0 && !input) return null;
  if (profile.output_tokens > 0 && !output) return null;
  const inputCost = input ? input(profile.input_tokens * (1 - profile.cached_input_ratio)) : 0;
  const cachedCost = cacheRead
    ? cacheRead(profile.input_tokens * profile.cached_input_ratio)
    : input
      ? input(profile.input_tokens * profile.cached_input_ratio)
      : 0;
  const outputCost = output ? output(profile.output_tokens) : 0;
  const requestCost = request ? request(1) : 0;
  return Number(((inputCost + cachedCost + outputCost + requestCost) * profile.requests_per_task).toPrecision(12));
}

function priceFor(offer: Offer, dimension: string): ((units: number) => number) | undefined {
  const points = offer.pricing.filter((value) => value.dimension === dimension && value.kind === "fixed" && value.amount_usd_per_unit !== null);
  const normalized = points.flatMap((point) => {
    if (point.amount_usd_per_unit === null) return [];
    if (point.unit === "million_tokens") return [point.amount_usd_per_unit / 1_000_000];
    if (point.unit === "token" || point.unit === "request") return [point.amount_usd_per_unit];
    return [];
  });
  if (normalized.length === 0) return undefined;
  const first = normalized[0];
  if (normalized.some((value) => Math.abs(value - first) > Math.max(1e-15, Math.abs(first) * 1e-9))) return undefined;
  return (units: number) => units * first;
}

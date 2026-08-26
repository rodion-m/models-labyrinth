import type { Offer, WorkloadProfile } from "./types.ts";

export function estimateCost(offer: Offer, profile: WorkloadProfile): number | null {
  const input = priceFor(offer, "input");
  const output = priceFor(offer, "output");
  const cacheRead = priceFor(offer, "cache_read");
  if (!input && !output) return null;
  const inputCost = input ? input(profile.input_tokens * (1 - profile.cached_input_ratio)) : 0;
  const cachedCost = cacheRead
    ? cacheRead(profile.input_tokens * profile.cached_input_ratio)
    : input
      ? input(profile.input_tokens * profile.cached_input_ratio)
      : 0;
  const outputCost = output ? output(profile.output_tokens) : 0;
  return Number(((inputCost + cachedCost + outputCost) * profile.requests_per_task).toPrecision(12));
}

function priceFor(offer: Offer, dimension: string): ((units: number) => number) | undefined {
  const point = offer.pricing.find((value) => value.dimension === dimension && value.kind !== "scheduled" && value.amount_usd_per_unit !== null);
  if (!point || point.amount_usd_per_unit === null) return undefined;
  return (units: number) => point.unit === "million_tokens"
    ? units / 1_000_000 * point.amount_usd_per_unit!
    : point.unit === "token"
      ? units * point.amount_usd_per_unit!
      : 0;
}

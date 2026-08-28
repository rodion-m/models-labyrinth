export function qualityCostPareto(candidates, snapshot, options) {
  const workload = resolveWorkload(snapshot.workload_profiles ?? [], options);
  const comparable = [];
  const unranked = [];
  let excludedBelowQualityFloor = 0;

  for (const candidate of candidates) {
    const quality = candidate.task_fit?.aggregate_score;
    if (!Number.isFinite(quality)) {
      const offers = candidate.matching_offers.length > 0 ? candidate.matching_offers : [null];
      for (const offer of offers) for (const effort of configurationsForOffer(offer, options.efforts)) {
        unranked.push(unrankedChoice(candidate, offer, effort, "quality score is unavailable"));
      }
      continue;
    }
    if (quality < options.minTaskFit) {
      excludedBelowQualityFloor += 1;
      continue;
    }
    for (const offer of candidate.matching_offers) {
      const cost = estimateWorkloadCost(offer, workload);
      for (const reasoningEffort of configurationsForOffer(offer, options.efforts)) {
        const choice = {
          canonical_model_id: candidate.canonical_model_id,
          name: candidate.name,
          offer_id: offer.id,
          provider_id: offer.provider_id,
          provider_model_id: offer.provider_model_id,
          variant: offer.variant ?? null,
          quantization: offer.quantization ?? null,
          reasoning_effort: reasoningEffort,
          quality_score: quality,
          quality_coverage: candidate.task_fit.coverage,
          quality_confidence: candidate.task_fit.confidence,
          estimated_cost_usd: cost.estimated_cost_usd,
          cost_components: cost.components,
          pricing_evidence: offer.evidence ?? [],
        };
        if (cost.estimated_cost_usd === null) {
          unranked.push({ ...choice, unranked_reason: `cost is incomplete: ${cost.missing_dimensions.join(", ")}` });
        } else {
          comparable.push(choice);
        }
      }
    }
  }

  const byPreference = (left, right) => right.quality_score - left.quality_score
    || left.estimated_cost_usd - right.estimated_cost_usd
    || left.canonical_model_id.localeCompare(right.canonical_model_id)
    || left.offer_id.localeCompare(right.offer_id);
  const front = nonDominatedFront(comparable, byPreference);
  unranked.sort((left, right) => left.canonical_model_id.localeCompare(right.canonical_model_id)
    || String(left.offer_id ?? "").localeCompare(String(right.offer_id ?? "")));

  return {
    front,
    unranked,
    meta: {
      mode: "quality-cost",
      objective: "maximize task-fit quality and minimize estimated workload cost",
      dominance: "A dominates B when quality(A) >= quality(B), cost(A) <= cost(B), and at least one inequality is strict",
      quality_floor: options.minTaskFit,
      workload,
      comparable_choice_count: comparable.length,
      pareto_front_choice_count: front.length,
      excluded_model_count_below_quality_floor: excludedBelowQualityFloor,
      unranked_choice_count: unranked.length,
    },
  };
}

function resolveWorkload(profiles, options) {
  if (options.profile) {
    const profile = profiles.find((candidate) => candidate.id === options.profile);
    if (!profile) throw new Error(`workload profile ${options.profile} was not found in the snapshot`);
    return profile;
  }
  return {
    id: "custom",
    input_tokens: options.workload.input_tokens,
    output_tokens: options.workload.output_tokens,
    cached_input_ratio: options.workload.cached_input_ratio ?? 0,
    ...(options.workload.cache_write_tokens === undefined ? {} : { cache_write_tokens: options.workload.cache_write_tokens }),
    ...(options.workload.reasoning_tokens === undefined ? {} : { reasoning_tokens: options.workload.reasoning_tokens }),
    requests_per_task: options.workload.requests_per_task ?? 1,
  };
}

function estimateWorkloadCost(offer, profile) {
  const cachedInput = profile.input_tokens * profile.cached_input_ratio;
  const uncachedInput = profile.input_tokens - cachedInput;
  const components = {};
  const missing = new Set();
  if (cachedInput > 0 && profile.cache_write_tokens === undefined) missing.add("cache_write_tokens");

  addCost(offer, "input", uncachedInput, profile.input_tokens, components, missing);
  addCost(offer, "cache_read", cachedInput, profile.input_tokens, components, missing);
  addCost(offer, "cache_write", profile.cache_write_tokens ?? 0, profile.input_tokens, components, missing);
  addCost(offer, "output", profile.output_tokens, profile.input_tokens, components, missing);
  addCost(offer, "reasoning", profile.reasoning_tokens ?? 0, profile.input_tokens, components, missing);
  if ((offer.pricing ?? []).some((point) => point.dimension === "request")) {
    addCost(offer, "request", 1, profile.input_tokens, components, missing);
  }

  if (missing.size > 0) {
    return { estimated_cost_usd: null, missing_dimensions: [...missing].sort(), components };
  }
  const requests = profile.requests_per_task;
  const scaled = Object.fromEntries(Object.entries(components).map(([key, value]) => [key, precise(value * requests)]));
  return {
    estimated_cost_usd: precise(Object.values(scaled).reduce((sum, value) => sum + value, 0)),
    missing_dimensions: [],
    components: scaled,
  };
}

function addCost(offer, dimension, units, contextTokens, components, missing) {
  if (units <= 0) return;
  const rate = rateFor(offer.pricing ?? [], dimension, contextTokens);
  if (rate === null) {
    missing.add(dimension);
    components[dimension] = null;
    return;
  }
  components[dimension] = rate * units;
}

function rateFor(pricing, dimension, contextTokens) {
  const points = pricing.filter((point) => point.dimension === dimension);
  if (points.some((point) => point.kind === "scheduled" || (point.kind === "tiered" && point.tier?.type === "volume"))) return null;
  const matchingTiers = points.filter((point) => point.kind === "tiered" && point.tier?.type === "context"
    && contextTokens >= (point.tier.min ?? 0)
    && (point.tier.max === undefined || contextTokens < point.tier.max));
  const applicable = matchingTiers.length > 0
    ? matchingTiers
    : points.filter((point) => point.kind === "fixed" || point.kind === "variable");
  if (applicable.length === 0 || applicable.some((point) => !Number.isFinite(point.amount_usd_per_unit))) return null;
  const rates = applicable.flatMap((point) => {
    if (point.unit === "million_tokens") return [point.amount_usd_per_unit / 1_000_000];
    if (point.unit === "token" || point.unit === "request") return [point.amount_usd_per_unit];
    return [];
  });
  if (rates.length === 0) return null;
  if (rates.some((rate) => Math.abs(rate - rates[0]) > Math.max(1e-15, Math.abs(rates[0]) * 1e-9))) return null;
  return rates[0];
}

function nonDominatedFront(choices, ordering) {
  const sorted = [...choices].sort(ordering);
  const front = [];
  let lowestCost = Number.POSITIVE_INFINITY;
  let highestQualityAtLowestCost = Number.NEGATIVE_INFINITY;
  for (const choice of sorted) {
    const cheaperSeen = lowestCost < choice.estimated_cost_usd;
    const sameCostHigherQualitySeen = lowestCost === choice.estimated_cost_usd
      && highestQualityAtLowestCost > choice.quality_score;
    if (!cheaperSeen && !sameCostHigherQualitySeen) front.push(choice);
    if (choice.estimated_cost_usd < lowestCost) {
      lowestCost = choice.estimated_cost_usd;
      highestQualityAtLowestCost = choice.quality_score;
    } else if (choice.estimated_cost_usd === lowestCost) {
      highestQualityAtLowestCost = Math.max(highestQualityAtLowestCost, choice.quality_score);
    }
  }
  return front;
}

function configurationsForOffer(offer, requestedEfforts) {
  if (!offer || requestedEfforts.length === 0) return [null];
  const supported = new Set((offer.reasoning_efforts ?? []).map((effort) => effort.toLowerCase()));
  return requestedEfforts.filter((effort) => supported.has(effort));
}

function unrankedChoice(candidate, offer, reasoningEffort, reason) {
  return {
    canonical_model_id: candidate.canonical_model_id,
    name: candidate.name,
    offer_id: offer?.id ?? null,
    provider_id: offer?.provider_id ?? null,
    provider_model_id: offer?.provider_model_id ?? null,
    variant: offer?.variant ?? null,
    quantization: offer?.quantization ?? null,
    reasoning_effort: reasoningEffort,
    quality_score: candidate.task_fit?.aggregate_score ?? null,
    estimated_cost_usd: null,
    unranked_reason: reason,
  };
}

function precise(value) {
  return Number(value.toPrecision(12));
}

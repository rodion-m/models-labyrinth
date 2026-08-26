import { DEFAULT_LIMIT, MAX_LIMIT, WORKLOAD_PROFILES } from "./constants.js";
import { estimateCost } from "./cost.js";
import { queryIndex, type IndexedModel } from "./query-index.js";
import type { ApiEnvelope, Model, Offer, Snapshot, WorkloadProfile } from "./types.js";
import { clamp, stableSort } from "./utils.js";

export interface ModelSummary {
  id: string;
  name: string;
  identity_confidence: Model["identity_confidence"];
  family?: string;
  release_date?: string;
  open_weights: boolean | null;
  modalities: Model["modalities"];
  context_tokens?: number;
  max_output_tokens?: number;
  capabilities: string[];
  providers: string[];
  offer_count: number;
  reasoning_efforts: string[];
  quantizations: string[];
  benchmark_ids: string[];
  source_ids: string[];
}

export function listModels(snapshot: Snapshot, params: URLSearchParams | Record<string, string | undefined>): ApiEnvelope<Model | ModelSummary> {
  const get = (key: string) => params instanceof URLSearchParams ? params.get(key) ?? undefined : params[key];
  const q = get("q")?.toLowerCase();
  const providers = valuesFor(params, "provider");
  const modalities = valuesFor(params, "modality");
  const capabilities = valuesFor(params, "capability");
  const efforts = valuesFor(params, "reasoning_effort");
  const quantizations = valuesFor(params, "quantization");
  const sources = valuesFor(params, "source");
  const benchmark = get("benchmark")?.toLowerCase();
  const openWeights = parseBoolean(get("open_weights"));
  const minContext = parseNonNegative(get("min_context"));
  let models = queryIndex(snapshot).models.filter((row) => {
    if (q && !row.search.includes(q)) return false;
    if (providers.length > 0 && !providers.some((provider) => row.providers.has(provider))) return false;
    if (!modalities.every((modality) => row.modalities.has(modality))) return false;
    if (!capabilities.every((capability) => row.capabilities.has(capability))) return false;
    if (efforts.length > 0 && !efforts.some((effort) => row.efforts.has(effort))) return false;
    if (quantizations.length > 0 && !quantizations.some((quantization) => row.quantizations.has(quantization))) return false;
    if (sources.length > 0 && !sources.some((source) => row.sources.has(source))) return false;
    if (benchmark && ![...row.benchmarks].some((value) => value === benchmark || value.includes(benchmark))) return false;
    if (openWeights !== undefined && row.model.open_weights !== openWeights) return false;
    if (minContext !== undefined && row.maxContext < minContext) return false;
    return true;
  });
  models = sortModels(models, get("sort"));
  const data: Array<Model | ModelSummary> = get("view") === "summary" ? models.map(summarizeModel) : models.map((row) => row.model);
  return paginate(data, get("limit"), get("offset"), snapshot);
}

export function getModel(snapshot: Snapshot, id: string): Model | undefined {
  const decoded = decodeURIComponent(id);
  return queryIndex(snapshot).byId.get(decoded) ?? queryIndex(snapshot).byAlias.get(decoded);
}

export interface FlatOffer extends Offer {
  model_id: string;
  model_name: string;
  estimated_cost_usd?: number | null;
  workload_profile_id?: string;
  workload_profile?: WorkloadProfile;
}

export class QueryInputError extends Error {}

export function listOffers(snapshot: Snapshot, params: URLSearchParams | Record<string, string | undefined>): ApiEnvelope<FlatOffer> {
  const get = (key: string) => params instanceof URLSearchParams ? params.get(key) ?? undefined : params[key];
  const providers = valuesFor(params, "provider");
  const modelIds = valuesFor(params, "model");
  const modalities = valuesFor(params, "modality");
  const q = get("q")?.toLowerCase();
  const capabilities = valuesFor(params, "capability");
  const parameters = valuesFor(params, "supported_parameter");
  const efforts = valuesFor(params, "reasoning_effort");
  const quantizations = valuesFor(params, "quantization");
  const sources = valuesFor(params, "source");
  const minContext = parseNonNegative(get("min_context"));
  const hasRuntime = parseBoolean(get("has_runtime"));
  const hasCachePricing = parseBoolean(get("has_cache_pricing"));
  const profile = resolveWorkloadProfile(get);
  const maxCost = parseNonNegative(get("max_cost_usd"));
  if (get("max_cost_usd") !== undefined && maxCost === undefined) throw new QueryInputError("max_cost_usd must be a non-negative number");
  if (maxCost !== undefined && !profile) throw new QueryInputError("max_cost_usd requires profile");
  if (get("sort") === "cost" && !profile) throw new QueryInputError("sort=cost requires profile");
  let indexedOffers = queryIndex(snapshot).offers.filter((row) => {
    if (providers.length > 0 && !providers.includes(row.providerId)) return false;
    if (modelIds.length > 0 && !modelIds.includes(row.flat.model_id.toLowerCase())) return false;
    if (!modalities.every((modality) => row.modelModalities.has(modality))) return false;
    if (q && !row.search.includes(q)) return false;
    if (!capabilities.every((capability) => row.capabilities.has(capability))) return false;
    if (!parameters.every((parameter) => row.offer.supported_parameters.some((value) => value.toLowerCase() === parameter))) return false;
    if (efforts.length > 0 && !efforts.some((effort) => row.efforts.has(effort))) return false;
    if (quantizations.length > 0 && (!row.quantization || !quantizations.includes(row.quantization))) return false;
    if (sources.length > 0 && !sources.some((source) => row.offer.evidence.some((evidence) => evidence.source_id.toLowerCase() === source))) return false;
    if (minContext !== undefined && (row.offer.context_tokens ?? 0) < minContext) return false;
    if (hasRuntime !== undefined && (row.offer.runtime.length > 0) !== hasRuntime) return false;
    if (hasCachePricing !== undefined && hasDeclaredCachePricing(row.offer) !== hasCachePricing) return false;
    return true;
  });
  if (profile) {
    if (maxCost !== undefined) indexedOffers = indexedOffers.filter((row) => {
      const estimated = estimateCost(row.offer, profile);
      return estimated !== null && estimated <= maxCost;
    });
  }
  const offers = stableSort(indexedOffers.map((row) => {
    if (!profile) return row.flat;
    return {
      ...row.flat,
      workload_profile_id: profile.id,
      workload_profile: profile,
      estimated_cost_usd: estimateCost(row.offer, profile),
    };
  }), (a, b) => {
    if (get("sort") === "context") return (b.context_tokens ?? 0) - (a.context_tokens ?? 0) || a.id.localeCompare(b.id);
    if (get("sort") === "cost" && profile) {
      const aCost = nullableNumber(a.estimated_cost_usd);
      const bCost = nullableNumber(b.estimated_cost_usd);
      if (aCost !== bCost) return aCost - bCost;
      return a.id.localeCompare(b.id);
    }
    return `${a.model_id}:${a.provider_id}:${a.provider_model_id}`.localeCompare(`${b.model_id}:${b.provider_id}:${b.provider_model_id}`);
  });
  return paginate(offers, get("limit"), get("offset"), snapshot);
}

export function listProviders(snapshot: Snapshot): Array<Record<string, unknown>> {
  return queryIndex(snapshot).providers;
}

export function listBenchmarks(snapshot: Snapshot): Array<Record<string, unknown>> {
  return queryIndex(snapshot).benchmarks;
}

export function listProfiles(): WorkloadProfile[] {
  return WORKLOAD_PROFILES;
}

export function listFacets(snapshot: Snapshot): Record<string, Array<{ value: string; model_count: number; offer_count?: number }>> {
  return queryIndex(snapshot).facets;
}

export function health(snapshot: Snapshot): Record<string, unknown> {
  const now = Date.now();
  return {
    status: snapshot.models.length > 0 ? "ok" : "empty",
    schema_version: snapshot.schema_version,
    generated_at: snapshot.generated_at,
    content_hash: snapshot.content_hash,
    model_count: snapshot.models.length,
    source_count: snapshot.sources.length,
    sources: snapshot.sources.map((source) => ({
      ...source,
      stale: source.last_success_at ? now - Date.parse(source.last_success_at) > 36 * 60 * 60 * 1000 : true,
    })),
  };
}

function paginate<T>(items: T[], rawLimit: string | undefined, rawOffset: string | undefined, snapshot: Snapshot): ApiEnvelope<T> {
  const limit = clamp(parseInteger(rawLimit) ?? DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = Math.max(0, parseInteger(rawOffset) ?? 0);
  return {
    data: items.slice(offset, offset + limit),
    meta: { total: items.length, limit, offset, has_more: offset + limit < items.length, updated_at: snapshot.generated_at, schema_version: snapshot.schema_version },
  };
}

function sortModels(models: IndexedModel[], sort: string | undefined): IndexedModel[] {
  return stableSort(models, (a, b) => {
    if (sort === "context") return (b.model.context_tokens ?? 0) - (a.model.context_tokens ?? 0) || a.model.id.localeCompare(b.model.id);
    if (sort === "updated") return b.latest.localeCompare(a.latest) || a.model.id.localeCompare(b.model.id);
    return a.model.name.localeCompare(b.model.name) || a.model.id.localeCompare(b.model.id);
  });
}

function summarizeModel(row: IndexedModel): ModelSummary {
  const providers = new Set(row.model.offers.map((offer) => offer.provider_id));
  return {
    id: row.model.id,
    name: row.model.name,
    identity_confidence: row.model.identity_confidence,
    ...(row.model.family ? { family: row.model.family } : {}),
    ...(row.model.release_date ? { release_date: row.model.release_date } : {}),
    open_weights: row.model.open_weights,
    modalities: row.model.modalities,
    ...(row.maxContext > 0 ? { context_tokens: row.maxContext } : {}),
    ...(row.model.max_output_tokens !== undefined ? { max_output_tokens: row.model.max_output_tokens } : {}),
    capabilities: [...row.capabilities].sort(),
    providers: [...providers].sort(),
    offer_count: row.model.offers.length,
    reasoning_efforts: [...row.efforts].sort(),
    quantizations: [...row.quantizations].sort(),
    benchmark_ids: [...row.benchmarks].sort(),
    source_ids: [...row.sources].sort(),
  };
}

function valuesFor(params: URLSearchParams | Record<string, string | undefined>, key: string): string[] {
  const raw = params instanceof URLSearchParams ? params.getAll(key) : [params[key]];
  return [...new Set(raw.flatMap((value) => value?.split(",") ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean))];
}

function hasDeclaredCachePricing(offer: Offer): boolean {
  return offer.pricing.some((price) => (price.dimension === "cache_read" || price.dimension === "cache_write") && price.amount_usd_per_unit !== null);
}

function nullableNumber(value: number | null | undefined): number {
  return value === null || value === undefined ? Number.POSITIVE_INFINITY : value;
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return undefined;
}

function parseNonNegative(value: string | undefined): number | undefined {
  const result = value === undefined ? NaN : Number(value);
  return Number.isFinite(result) && result >= 0 ? result : undefined;
}

function parseInteger(value: string | undefined): number | undefined {
  const result = value === undefined ? NaN : Number(value);
  return Number.isInteger(result) && result >= 0 ? result : undefined;
}

function resolveWorkloadProfile(get: (key: string) => string | undefined): WorkloadProfile | undefined {
  const profileId = get("profile");
  const customKeys = ["input_tokens", "output_tokens", "cached_input_ratio", "requests_per_task"];
  const hasCustomValues = customKeys.some((key) => get(key) !== undefined);
  if (!profileId) {
    if (hasCustomValues) throw new QueryInputError("custom workload parameters require profile=custom");
    return undefined;
  }
  if (profileId !== "custom") {
    if (hasCustomValues) throw new QueryInputError("custom workload parameters can only be used with profile=custom");
    const profile = WORKLOAD_PROFILES.find((value) => value.id === profileId);
    if (!profile) throw new QueryInputError(`unknown workload profile: ${profileId}`);
    return profile;
  }

  const inputTokens = requiredNonNegativeInteger(get("input_tokens"), "input_tokens");
  const outputTokens = requiredNonNegativeInteger(get("output_tokens"), "output_tokens");
  const cachedInputRatio = optionalNumber(get("cached_input_ratio"), 0, "cached_input_ratio");
  if (cachedInputRatio < 0 || cachedInputRatio > 1) throw new QueryInputError("cached_input_ratio must be between 0 and 1");
  const requestsPerTask = optionalInteger(get("requests_per_task"), 1, "requests_per_task");
  if (requestsPerTask < 1) throw new QueryInputError("requests_per_task must be a positive integer");
  return {
    id: "custom",
    description: "Caller-supplied workload profile.",
    input_tokens: inputTokens,
    cached_input_ratio: cachedInputRatio,
    output_tokens: outputTokens,
    requests_per_task: requestsPerTask,
  };
}

function requiredNonNegativeInteger(value: string | undefined, name: string): number {
  if (value === undefined || value.trim() === "") throw new QueryInputError(`${name} is required for profile=custom`);
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new QueryInputError(`${name} must be a non-negative integer`);
  return parsed;
}

function optionalInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new QueryInputError(`${name} must be an integer`);
  return parsed;
}

function optionalNumber(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new QueryInputError(`${name} must be a number`);
  return parsed;
}

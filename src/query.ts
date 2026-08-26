import { DEFAULT_LIMIT, MAX_LIMIT, WORKLOAD_PROFILES } from "./constants.js";
import { estimateCost } from "./cost.js";
import { queryIndex, type IndexedModel } from "./query-index.js";
import type { ApiEnvelope, Model, Offer, Snapshot, WorkloadProfile } from "./types.js";
import { clamp, stableSort } from "./utils.js";

export function listModels(snapshot: Snapshot, params: URLSearchParams | Record<string, string | undefined>): ApiEnvelope<Model> {
  const get = (key: string) => params instanceof URLSearchParams ? params.get(key) ?? undefined : params[key];
  const q = get("q")?.toLowerCase();
  const provider = get("provider")?.toLowerCase();
  const capability = get("capability")?.toLowerCase();
  const effort = get("reasoning_effort")?.toLowerCase();
  const quantization = get("quantization")?.toLowerCase();
  const source = get("source")?.toLowerCase();
  const benchmark = get("benchmark")?.toLowerCase();
  const openWeights = parseBoolean(get("open_weights"));
  const minContext = parseNonNegative(get("min_context"));
  let models = queryIndex(snapshot).models.filter((row) => {
    if (q && !row.search.includes(q)) return false;
    if (provider && !row.providerSearch.includes(provider)) return false;
    if (capability && !row.capabilities.has(capability)) return false;
    if (effort && !row.efforts.has(effort)) return false;
    if (quantization && !row.quantizations.has(quantization)) return false;
    if (source && !row.sources.has(source)) return false;
    if (benchmark && ![...row.benchmarks].some((value) => value === benchmark || value.includes(benchmark))) return false;
    if (openWeights !== undefined && row.model.open_weights !== openWeights) return false;
    if (minContext !== undefined && row.maxContext < minContext) return false;
    return true;
  });
  models = sortModels(models, get("sort"));
  return paginate(models.map((row) => row.model), get("limit"), get("offset"), snapshot);
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
}

export function listOffers(snapshot: Snapshot, params: URLSearchParams | Record<string, string | undefined>): ApiEnvelope<FlatOffer> {
  const get = (key: string) => params instanceof URLSearchParams ? params.get(key) ?? undefined : params[key];
  const provider = get("provider")?.toLowerCase();
  const q = get("q")?.toLowerCase();
  const effort = get("reasoning_effort")?.toLowerCase();
  const quantization = get("quantization")?.toLowerCase();
  const profile = WORKLOAD_PROFILES.find((value) => value.id === get("profile"));
  const maxCost = parseNonNegative(get("max_cost_usd"));
  let indexedOffers = queryIndex(snapshot).offers.filter((row) => {
    if (provider && !row.providerSearch.includes(provider)) return false;
    if (q && !row.search.includes(q)) return false;
    if (effort && !row.efforts.has(effort)) return false;
    if (quantization && row.quantization !== quantization) return false;
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
    return { ...row.flat, workload_profile_id: profile.id, estimated_cost_usd: estimateCost(row.offer, profile) };
  }), (a, b) => `${a.model_id}:${a.provider_id}:${a.provider_model_id}`.localeCompare(`${b.model_id}:${b.provider_id}:${b.provider_model_id}`));
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

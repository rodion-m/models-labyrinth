import type { Model, Offer, Snapshot } from "./types.js";
import type { FlatOffer } from "./query.js";

export interface IndexedModel {
  model: Model;
  search: string;
  providerSearch: string;
  capabilities: ReadonlySet<string>;
  efforts: ReadonlySet<string>;
  quantizations: ReadonlySet<string>;
  sources: ReadonlySet<string>;
  benchmarks: ReadonlySet<string>;
  maxContext: number;
  latest: string;
}

export interface IndexedOffer {
  flat: FlatOffer;
  offer: Offer;
  search: string;
  providerSearch: string;
  efforts: ReadonlySet<string>;
  quantization?: string;
}

export interface QueryIndex {
  models: IndexedModel[];
  offers: IndexedOffer[];
  byId: Map<string, Model>;
  byAlias: Map<string, Model | undefined>;
  providers: Array<Record<string, unknown>>;
  benchmarks: Array<Record<string, unknown>>;
}

const indexes = new WeakMap<Snapshot, QueryIndex>();

export function queryIndex(snapshot: Snapshot): QueryIndex {
  const existing = indexes.get(snapshot);
  if (existing) return existing;

  const models = snapshot.models.map(indexModel);
  const offers = models.flatMap((row) => row.model.offers.map((offer) => indexOffer(row.model, offer)));
  const byId = new Map(models.map((row) => [row.model.id, row.model]));
  const byAlias = new Map<string, Model | undefined>();
  for (const row of models) for (const alias of row.model.aliases) {
    if (!byAlias.has(alias.id)) byAlias.set(alias.id, row.model);
    else if (byAlias.get(alias.id) !== row.model) byAlias.set(alias.id, undefined);
  }
  const result: QueryIndex = {
    models,
    offers,
    byId,
    byAlias,
    providers: buildProviders(models),
    benchmarks: buildBenchmarks(models, snapshot),
  };
  indexes.set(snapshot, result);
  return result;
}

function indexModel(model: Model): IndexedModel {
  const providers = new Set<string>();
  const capabilities = new Set<string>(trueKeys(model.capabilities));
  const efforts = new Set<string>();
  const quantizations = new Set<string>();
  const sources = new Set<string>();
  const benchmarks = new Set<string>();
  for (const offer of model.offers) {
    providers.add(offer.provider_id.toLowerCase());
    if (offer.provider_name) providers.add(offer.provider_name.toLowerCase());
    for (const effort of offer.reasoning_efforts) efforts.add(effort.toLowerCase());
    if (offer.reasoning_efforts.length > 0) capabilities.add("reasoning");
    for (const capability of trueKeys(offer.capabilities)) capabilities.add(capability);
    if (offer.quantization) quantizations.add(offer.quantization.toLowerCase());
    for (const evidence of offer.evidence) sources.add(evidence.source_id.toLowerCase());
  }
  for (const evidence of [...model.evidence, ...model.benchmarks.map((item) => item.evidence)]) sources.add(evidence.source_id.toLowerCase());
  for (const benchmark of model.benchmarks) benchmarks.add(benchmark.benchmark_id.toLowerCase());
  const search = [model.id, model.name, ...model.aliases.map((value) => value.id)].join(" ").toLowerCase();
  const providerSearch = [...providers].join(" ");
  const maxContext = Math.max(model.context_tokens ?? 0, ...model.offers.map((offer) => offer.context_tokens ?? 0));
  return {
    model,
    search,
    providerSearch,
    capabilities,
    efforts,
    quantizations,
    sources,
    benchmarks,
    maxContext,
    latest: model.evidence.map((value) => value.fetched_at).sort().at(-1) ?? "",
  };
}

function indexOffer(model: Model, offer: Offer): IndexedOffer {
  return {
    flat: { ...offer, model_id: model.id, model_name: model.name },
    offer,
    search: `${model.id} ${model.name} ${offer.provider_model_id}`.toLowerCase(),
    providerSearch: `${offer.provider_id} ${offer.provider_name ?? ""}`.toLowerCase(),
    efforts: new Set(offer.reasoning_efforts.map((value) => value.toLowerCase())),
    ...(offer.quantization ? { quantization: offer.quantization.toLowerCase() } : {}),
  };
}

function buildProviders(models: IndexedModel[]): Array<Record<string, unknown>> {
  const providers = new Map<string, { provider_id: string; provider_name?: string; model_ids: Set<string>; offer_count: number; quantizations: Set<string> }>();
  for (const row of models) for (const offer of row.model.offers) {
    const current = providers.get(offer.provider_id) ?? { provider_id: offer.provider_id, provider_name: offer.provider_name, model_ids: new Set<string>(), offer_count: 0, quantizations: new Set<string>() };
    current.model_ids.add(row.model.id);
    current.offer_count += 1;
    if (offer.quantization) current.quantizations.add(offer.quantization);
    providers.set(offer.provider_id, current);
  }
  return [...providers.values()]
    .map((value) => ({ provider_id: value.provider_id, provider_name: value.provider_name, model_count: value.model_ids.size, offer_count: value.offer_count, quantizations: [...value.quantizations].sort() }))
    .sort((a, b) => a.provider_id.localeCompare(b.provider_id));
}

function buildBenchmarks(models: IndexedModel[], snapshot: Snapshot): Array<Record<string, unknown>> {
  const counts = new Map<string, { observations: number; models: Set<string>; sources: Set<string> }>();
  for (const row of models) for (const observation of row.model.benchmarks) {
    const current = counts.get(observation.benchmark_id) ?? { observations: 0, models: new Set<string>(), sources: new Set<string>() };
    current.observations += 1;
    current.models.add(row.model.id);
    current.sources.add(observation.evidence.source_id);
    counts.set(observation.benchmark_id, current);
  }
  const definitions = new Map(snapshot.benchmarks.map((value) => [value.id, value]));
  return [...counts.entries()].map(([id, value]) => ({
    id,
    ...(definitions.get(id) ? { definition: definitions.get(id) } : {}),
    observation_count: value.observations,
    model_count: value.models.size,
    sources: [...value.sources].sort(),
    independent_sources: [...value.sources].filter((source) => source !== "benchlm" && source !== "cloudprice" && source !== "benchgecko").sort(),
  })).sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function trueKeys(value: Record<string, boolean | null>): string[] {
  return Object.entries(value).filter(([, enabled]) => enabled === true).map(([key]) => key.toLowerCase());
}

import type { BenchmarkDefinition, PricePoint, RuntimeObservation, SourceRecord, SourceResult } from "../types.js";
import { fetchJson } from "../http.js";
import { canonicalModelId } from "../identity.js";
import { baseRecord, mergeSourceRecord, newRecordMap } from "./common.js";
import { evidence, numeric, record, stringValue } from "../source-utils.js";
import { asArray, asRecord, numberValue } from "../utils.js";

const BASE = "https://www.benchlm.ai/data";
const URLS = {
  models: `${BASE}/models.json`,
  benchmarks: `${BASE}/benchmarks.json`,
  pricing: `${BASE}/pricing.json`,
  speed: `${BASE}/speed.json`,
};

export async function collectBenchLM(options: { fetchImpl?: typeof fetch } = {}): Promise<SourceResult> {
  const fetchedAt = new Date().toISOString();
  const [modelsPayload, benchmarksPayload, pricingPayload, speedPayload] = await Promise.all([
    fetchJson<any>(URLS.models, { fetchImpl: options.fetchImpl, timeoutMs: 30_000, maxBytes: 8 * 1024 * 1024 }),
    fetchJson<any>(URLS.benchmarks, { fetchImpl: options.fetchImpl, timeoutMs: 30_000, maxBytes: 4 * 1024 * 1024 }),
    fetchJson<any>(URLS.pricing, { fetchImpl: options.fetchImpl, timeoutMs: 30_000, maxBytes: 4 * 1024 * 1024 }),
    fetchJson<any>(URLS.speed, { fetchImpl: options.fetchImpl, timeoutMs: 30_000, maxBytes: 4 * 1024 * 1024 }),
  ]);
  const modelRows = asArray(modelsPayload?.items);
  if (modelRows.length === 0) throw new Error("BenchLM models snapshot returned no models");
  const records = new Map<string, SourceRecord>();
  for (const row of modelRows) {
    const item = record(row);
    const normalized = baseRecord({
      sourceId: "benchlm",
      rawId: item.canonicalModelKey ?? item.id ?? item.slug ?? item.model,
      publisher: item.creator,
      name: item.model ?? item.name,
      family: item.family?.familyKey ?? item.family,
      releaseDate: item.releaseDate,
      openWeights: item.sourceType === "open" ? true : undefined,
      contextTokens: item.contextWindowTokens ?? item.contextWindow,
      fetchedAt,
      url: stringValue(item.url) ?? URLS.models,
      evidenceFields: ["metadata", "benchmarks", "ranking"],
    });
    normalized.benchmarks = [
      ...flattenNumeric(item.benchmarks).map(({ id, value }) => ({
        benchmark_id: id,
        value,
        evidence: evidence("benchlm", stringValue(item.url) ?? URLS.models, fetchedAt, ["benchmarks"]),
      })),
      ...flattenNumeric(item.scores).map(({ id, value }) => ({
        benchmark_id: `score.${id}`,
        value,
        evidence: evidence("benchlm", stringValue(item.url) ?? URLS.models, fetchedAt, ["scores"]),
      })),
    ];
    normalized.evidence = [evidence("benchlm", stringValue(item.url) ?? URLS.models, fetchedAt, ["metadata", "benchmarks", "ranking"])];
    records.set(normalized.id, normalized);
  }
  mergePriceRows(records, asArray(pricingPayload?.items), fetchedAt);
  mergeSpeedRows(records, asArray(speedPayload?.items), fetchedAt, speedPayload?.source);
  const benchmarkDefinitions: BenchmarkDefinition[] = asArray(benchmarksPayload?.items).flatMap((row) => {
    const item = record(row);
    const id = stringValue(item.benchmarkKey ?? item.id ?? item.name);
    if (!id) return [];
    return [{
      id,
      ...(stringValue(item.name) ? { name: stringValue(item.name) } : {}),
      ...(stringValue(item.categoryLabel ?? item.category) ? { category: stringValue(item.categoryLabel ?? item.category) } : {}),
      ...(stringValue(item.description) ? { description: stringValue(item.description)!.slice(0, 300) } : {}),
      ...(numberValue(item.year) !== undefined ? { year: numberValue(item.year) } : {}),
      ...(stringValue(item.url) ? { url: stringValue(item.url) } : {}),
      evidence: evidence("benchlm", stringValue(item.url) ?? URLS.benchmarks, fetchedAt, ["benchmark_definition"]),
    }];
  });
  return {
    source_id: "benchlm",
    url: URLS.models,
    fetched_at: fetchedAt,
    status: "ok",
    records: [...newRecordMap([...records.values()]).values()],
    benchmark_definitions: benchmarkDefinitions,
  };
}

function mergePriceRows(records: Map<string, SourceRecord>, rows: any[], fetchedAt: string): void {
  for (const row of rows) {
    const item = record(row);
    const identity = canonicalModelId({ sourceId: "benchlm", rawId: item.canonicalModelKey ?? item.slug ?? item.model, publisher: item.creator, name: item.model });
    const target = records.get(identity.id) ?? baseRecord({
      sourceId: "benchlm",
      rawId: item.canonicalModelKey ?? item.slug ?? item.model,
      publisher: item.creator,
      name: item.model,
      fetchedAt,
      url: stringValue(item.url) ?? URLS.pricing,
      evidenceFields: ["pricing"],
    });
    const prices: PricePoint[] = [];
    for (const [key, dimension] of [["inputPrice", "input"], ["outputPrice", "output"], ["cachedInputPrice", "cache_read"]] as const) {
      const raw = item[key];
      if (raw === undefined || raw === null || raw === "") continue;
      const parsed = numeric(raw);
      prices.push({ dimension, unit: "million_tokens", amount_usd_per_unit: parsed ?? null, raw: typeof raw === "number" || typeof raw === "string" ? raw : null, kind: parsed === undefined ? "variable" : "fixed" });
    }
    if (prices.length === 0) continue;
    const merged = mergeSourceRecord(target, {
      pricing_observations: [{ pricing: prices, evidence: evidence("benchlm", stringValue(item.url) ?? URLS.pricing, fetchedAt, ["pricing"]) }],
    });
    records.set(identity.id, merged);
  }
}

function mergeSpeedRows(records: Map<string, SourceRecord>, rows: any[], fetchedAt: string, sourceMeta: unknown): void {
  const sourceName = JSON.stringify(sourceMeta ?? "").toLowerCase();
  const derivedFrom = sourceName.includes("artificial") ? ["artificial-analysis"] : [];
  for (const row of rows) {
    const item = record(row);
    const identity = canonicalModelId({ sourceId: "benchlm", rawId: item.canonicalModelKey ?? item.slug ?? item.model, publisher: item.creator, name: item.model });
    const target = records.get(identity.id) ?? baseRecord({
      sourceId: "benchlm",
      rawId: item.canonicalModelKey ?? item.slug ?? item.model,
      publisher: item.creator,
      name: item.model,
      fetchedAt,
      url: stringValue(item.url) ?? URLS.speed,
      evidenceFields: ["runtime"],
    });
    const metrics: Record<string, number | null> = {
      tokens_per_second: numeric(item.tokensPerSecond) ?? null,
      ttft: numeric(item.ttft) ?? null,
    };
    if (Object.values(metrics).every((value) => value === null)) continue;
    const runtime: RuntimeObservation = {
      scope: "model",
      metrics,
      evidence: evidence("benchlm", stringValue(item.url) ?? URLS.speed, fetchedAt, ["runtime"], derivedFrom),
    };
    records.set(identity.id, mergeSourceRecord(target, { runtime_observations: [runtime] }));
  }
}

function flattenNumeric(value: unknown): Array<{ id: string; value: number }> {
  const output: Array<{ id: string; value: number }> = [];
  function visit(current: unknown, path: string[]): void {
    const parsed = numberValue(current);
    if (parsed !== undefined) {
      output.push({ id: path.join("."), value: parsed });
      return;
    }
    if (!current || typeof current !== "object" || Array.isArray(current)) return;
    for (const [key, child] of Object.entries(asRecord(current))) visit(child, [...path, key]);
  }
  visit(value, []);
  return output;
}

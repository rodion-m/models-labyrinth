import type { Offer, SourceRecord, SourceResult } from "../types.ts";
import { fetchJson, mapWithConcurrency } from "../http.ts";
import { canonicalModelId } from "../identity.ts";
import { normalizeOpenRouterPricing } from "../price.ts";
import { baseRecord, offer } from "./common.ts";
import { capabilitiesFromParameters, evidence, numeric, record, runtimeFromEndpoint, stringValue } from "../source-utils.ts";
import { arrayOfStrings, asArray, asRecord, boolValue, mergeUniqueStrings } from "../utils.ts";

export const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models?output_modalities=all";
const OPENROUTER_API = "https://openrouter.ai/api/v1";

interface OpenRouterOptions {
  fetchImpl?: typeof fetch;
  previous?: { models?: Array<{ id: string; offers?: Offer[] }> };
  includeEndpoints?: boolean;
  endpointCap?: number;
  endpointConcurrency?: number;
}

export async function collectOpenRouter(options: OpenRouterOptions = {}): Promise<SourceResult> {
  const fetchedAt = new Date().toISOString();
  const headers = process.env.OPENROUTER_API_KEY ? { authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` } : undefined;
  const payload = await fetchJson<any>(OPENROUTER_MODELS_URL, {
    fetchImpl: options.fetchImpl,
    headers,
    timeoutMs: 30_000,
    maxBytes: 8 * 1024 * 1024,
    retries: 1,
  });
  const rows = asArray(payload?.data);
  if (rows.length === 0) throw new Error("OpenRouter catalog returned no models");
  const records = rows.map((row) => normalizeModel(row, fetchedAt));
  const warnings: string[] = [];
  const includeEndpoints = options.includeEndpoints ?? process.env.OPENROUTER_ENDPOINTS !== "0";
  if (includeEndpoints) {
    const cap = options.endpointCap ?? positiveEnv("OPENROUTER_ENDPOINT_CAP", 120);
    const concurrency = options.endpointConcurrency ?? positiveEnv("OPENROUTER_ENDPOINT_CONCURRENCY", 6);
    const targets = rows
      .filter((row) => stringValue(row?.canonical_slug) || stringValue(row?.id))
      .slice(0, cap);
    const endpointResults = await mapWithConcurrency(targets, concurrency, async (row) => {
      const pathId = stringValue(row.canonical_slug) ?? stringValue(row.id)!;
      const encoded = pathId.split("/").map(encodeURIComponent).join("/");
      const url = `${OPENROUTER_API}/models/${encoded}/endpoints`;
      try {
        const response = await fetchJson<any>(url, {
          fetchImpl: options.fetchImpl,
          headers,
          timeoutMs: 15_000,
          maxBytes: 2 * 1024 * 1024,
          retries: 0,
        });
        return { row, url, endpoints: asArray(response?.data?.endpoints ?? response?.endpoints), error: undefined };
      } catch (error) {
        return { row, url, endpoints: [], error: error instanceof Error ? error.message : String(error) };
      }
    });
    const byId = new Map(records.map((record) => [record.id, record]));
    for (const result of endpointResults) {
      if (result.error) {
        warnings.push(`${stringValue(result.row.id) ?? "unknown"}: ${result.error}`);
        continue;
      }
      const identity = canonicalModelId({ sourceId: "openrouter", rawId: result.row.id, publisher: result.row.id?.split?.("/")[0], name: result.row.name });
      const target = byId.get(identity.id);
      if (!target) continue;
      for (const endpoint of result.endpoints) {
        const endpointRecord = record(endpoint);
        const providerId = stringValue(endpointRecord.provider_name) ?? "unknown";
        const endpointModelId = stringValue(endpointRecord.model_id) ?? stringValue(result.row.id) ?? "unknown";
        const variant = stringValue(endpointRecord.tag);
        const quantization = stringValue(endpointRecord.quantization);
        const runtime = runtimeFromEndpoint("openrouter", result.url, fetchedAt, endpointRecord);
        const dataPolicy = endpointRecord.data_policy
          ?? (endpointRecord.data_collection !== undefined ? { data_collection: endpointRecord.data_collection } : undefined)
          ?? (endpointRecord.zdr !== undefined ? { zdr: Boolean(endpointRecord.zdr) } : undefined);
        const endpointOffer = offer({
          id: `openrouter:${providerId.toLowerCase().replace(/[^a-z0-9]+/g, "-")}:${endpointModelId}:${variant ?? "default"}:${quantization ?? "unknown"}`,
          providerId: providerId.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "unknown",
          providerName: providerId,
          providerModelId: endpointModelId,
          variant,
          quantization,
          contextTokens: endpointRecord.context_length,
          maxOutputTokens: endpointRecord.max_completion_tokens,
          supportedParameters: endpointRecord.supported_parameters ?? result.row.supported_parameters,
          capabilities: {
            ...capabilitiesFromParameters(endpointRecord.supported_parameters ?? result.row.supported_parameters),
            implicit_caching: boolValue(endpointRecord.supports_implicit_caching) ?? null,
          },
          reasoningEfforts: arrayOfStrings(result.row?.reasoning?.supported_efforts),
          dataPolicy,
          pricing: normalizeOpenRouterPricing(endpointRecord.pricing ?? result.row.pricing),
          runtime: [runtime],
          evidence: [evidence("openrouter", result.url, fetchedAt, ["provider", "quantization", "pricing", "runtime", "supported_parameters"])],
        });
        target.offers = [...(target.offers ?? []), endpointOffer];
      }
    }
  }
  return {
    source_id: "openrouter",
    url: OPENROUTER_MODELS_URL,
    fetched_at: fetchedAt,
    status: "ok",
    records,
    warnings,
  };
}

function normalizeModel(row: any, fetchedAt: string): SourceRecord {
  const id = stringValue(row?.id) ?? stringValue(row?.canonical_slug) ?? row?.name ?? "unknown";
  const publisher = id.includes("/") ? id.split("/")[0] : undefined;
  const record = baseRecord({
    sourceId: "openrouter",
    rawId: id,
    publisher,
    name: row?.name,
    family: row?.architecture?.tokenizer,
    releaseDate: row?.created ? new Date(Number(row.created) * 1000).toISOString().slice(0, 10) : undefined,
    contextTokens: row?.context_length,
    maxOutputTokens: row?.top_provider?.max_completion_tokens,
    modalities: row?.architecture,
    parameters: row?.supported_parameters,
    reasoning: row?.reasoning,
    fetchedAt,
    url: OPENROUTER_MODELS_URL,
    evidenceFields: ["metadata", "capabilities", "pricing", "benchmarks"],
  });
  const canonical = canonicalModelId({ sourceId: "openrouter", rawId: id, publisher, name: row?.name });
  record.aliases = [
    ...(record.aliases ?? []),
    ...(stringValue(row?.canonical_slug) ? [{ id: stringValue(row.canonical_slug)!, source_id: "openrouter", kind: "canonical_slug" }] : []),
    ...(stringValue(row?.hugging_face_id) ? [{ id: stringValue(row.hugging_face_id)!, source_id: "openrouter", kind: "hugging_face_id" }] : []),
  ];
  record.id = canonical.id;
  record.pricing_observations = row?.pricing
    ? [{ pricing: normalizeOpenRouterPricing(row.pricing), evidence: evidence("openrouter", OPENROUTER_MODELS_URL, fetchedAt, ["pricing"], [], "Top-provider catalog pricing; provider-specific offers are separate.") }]
    : [];
  const benchmarkValues = flattenBenchmarks(row?.benchmarks);
  record.benchmarks = benchmarkValues.map(({ id: benchmarkId, value }) => ({
    benchmark_id: benchmarkId,
    value,
    evidence: evidence("openrouter", OPENROUTER_MODELS_URL, fetchedAt, ["benchmarks"], benchmarkId.startsWith("artificial_analysis") ? ["artificial-analysis"] : []),
  }));
  record.evidence = [evidence("openrouter", OPENROUTER_MODELS_URL, fetchedAt, ["metadata", "capabilities", "pricing", "benchmarks"]), ...(record.evidence ?? [])];
  return record;
}

function flattenBenchmarks(value: unknown): Array<{ id: string; value: number }> {
  const output: Array<{ id: string; value: number }> = [];
  function visit(current: unknown, path: string[]): void {
    if (typeof current === "number" && Number.isFinite(current)) {
      output.push({ id: path.join("."), value: current });
      return;
    }
    if (!current || typeof current !== "object" || Array.isArray(current)) return;
    for (const [key, child] of Object.entries(current)) visit(child, [...path, key]);
  }
  visit(value, []);
  return output;
}

function positiveEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

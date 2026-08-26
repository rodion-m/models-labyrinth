import type { Offer, SourceRecord, SourceResult } from "../types.js";
import { fetchJson } from "../http.js";
import { normalizeMillionPricing } from "../price.js";
import { baseRecord, mergeSourceRecord, newRecordMap, offer } from "./common.js";
import { capabilitiesFromParameters, evidence, reasoningSupport, record, stringValue } from "../source-utils.js";
import { arrayOfStrings, asRecord, boolValue, numberValue } from "../utils.js";

export const MODELS_DEV_URL = "https://models.dev/catalog.json";

export async function collectModelsDev(options: { fetchImpl?: typeof fetch } = {}): Promise<SourceResult> {
  const fetchedAt = new Date().toISOString();
  const payload = await fetchJson<any>(MODELS_DEV_URL, {
    fetchImpl: options.fetchImpl,
    timeoutMs: 30_000,
    maxBytes: 14 * 1024 * 1024,
    retries: 1,
  });
  const modelEntries = Object.entries(asRecord(payload?.models));
  const providerEntries = Object.entries(asRecord(payload?.providers));
  if (modelEntries.length === 0 && providerEntries.length === 0) throw new Error("Models.dev catalog returned no records");
  const records = new Map<string, SourceRecord>();
  for (const [key, value] of modelEntries) {
    const model = record(value);
    const id = stringValue(model.id) ?? key;
    const publisher = id.includes("/") ? id.split("/")[0] : undefined;
    const normalized = baseRecord({
      sourceId: "models_dev",
      rawId: id,
      publisher,
      name: model.name ?? key,
      family: model.family,
      releaseDate: model.release_date,
      openWeights: model.open_weights,
      license: model.license,
      contextTokens: model.limit?.context,
      maxOutputTokens: model.limit?.output,
      modalities: model.modalities,
      parameters: model.tool_call || model.structured_output ? [
        ...(model.tool_call ? ["tools"] : []),
        ...(model.structured_output ? ["structured_outputs"] : []),
      ] : undefined,
      reasoning: typeof model.reasoning === "boolean" ? { supported: model.reasoning } : model.reasoning_options ?? model.reasoning,
      fetchedAt,
      url: MODELS_DEV_URL,
      evidenceFields: ["metadata", "capabilities", "limits"],
    });
    normalized.evidence = [evidence("models_dev", MODELS_DEV_URL, fetchedAt, ["metadata", "capabilities", "limits", "reasoning_options"])];
    normalized.id = normalized.id || id;
    records.set(normalized.id, normalized);
  }
  for (const [providerKey, providerValue] of providerEntries) {
    const provider = record(providerValue);
    const providerName = stringValue(provider.name) ?? providerKey;
    for (const [modelKey, value] of Object.entries(asRecord(provider.models))) {
      const providerModel = record(value);
      const providerModelId = stringValue(providerModel.id) ?? modelKey;
      const modelId = findModelId(providerModel, modelKey, records, providerKey);
      const existing = records.get(modelId);
      const sourceModel = existing ?? baseRecord({
        sourceId: "models_dev",
        rawId: `${providerKey}/${providerModelId}`,
        publisher: providerKey,
        name: providerModel.name ?? providerModelId,
        releaseDate: providerModel.release_date,
        openWeights: providerModel.open_weights,
        license: providerModel.license,
        contextTokens: providerModel.limit?.context,
        maxOutputTokens: providerModel.limit?.output,
        modalities: providerModel.modalities,
        parameters: providerModel.tool_call || providerModel.structured_output ? ["tools", "structured_outputs"] : undefined,
        reasoning: providerModel.reasoning_options ?? providerModel.reasoning,
        fetchedAt,
        url: MODELS_DEV_URL,
        evidenceFields: ["provider", "pricing", "capabilities"],
      });
      const params = arrayOfStrings(providerModel.supported_parameters ?? providerModel.parameters);
      const capabilities = {
        ...capabilitiesFromParameters(params),
        tools: boolValue(providerModel.tool_call) ?? (params.length > 0 ? params.includes("tools") : null),
        structured_outputs: boolValue(providerModel.structured_output) ?? (params.length > 0 ? params.includes("structured_outputs") : null),
        reasoning: typeof providerModel.reasoning === "boolean" ? providerModel.reasoning : null,
      };
      const reasoning = providerModel.reasoning_options ?? providerModel.reasoning;
      const reasoningEntry = reasoning !== undefined
        ? reasoningSupport("models_dev", typeof reasoning === "boolean" ? { supported: reasoning } : reasoning, fetchedAt, MODELS_DEV_URL, params)
        : undefined;
      const providerOffer: Offer = offer({
        id: `models_dev:${providerKey}:${providerModelId}`,
        providerId: providerKey,
        providerName,
        providerModelId,
        contextTokens: providerModel.limit?.context,
        maxOutputTokens: providerModel.limit?.output,
        supportedParameters: params,
        capabilities,
        reasoningEfforts: arrayOfStrings(providerModel.reasoning_options?.supported_efforts ?? providerModel.reasoning_options?.efforts),
        dataPolicy: providerModel.data_policy,
        pricing: normalizeMillionPricing(providerModel.cost),
        evidence: [evidence("models_dev", MODELS_DEV_URL, fetchedAt, ["provider", "pricing", "capabilities", "limits"])],
      });
      const extra: Partial<SourceRecord> = {
        offers: [providerOffer],
        ...(reasoningEntry ? { reasoning: [reasoningEntry] } : {}),
        evidence: [evidence("models_dev", MODELS_DEV_URL, fetchedAt, ["provider", "pricing", "capabilities"])],
      };
      records.set(modelId, mergeSourceRecord(sourceModel, extra));
    }
  }
  return {
    source_id: "models_dev",
    url: MODELS_DEV_URL,
    fetched_at: fetchedAt,
    status: "ok",
    records: [...newRecordMap([...records.values()]).values()],
  };
}

function findModelId(providerModel: Record<string, any>, modelKey: string, records: Map<string, SourceRecord>, providerKey: string): string {
  const candidates = [providerModel.id, modelKey, `${providerKey}/${modelKey}`].filter(Boolean).map(String);
  for (const candidate of candidates) {
    const direct = [...records.keys()].find((id) => id === candidate || id.endsWith(`/${candidate}`));
    if (direct) return direct;
  }
  return `${providerKey}/${modelKey}`.toLowerCase();
}

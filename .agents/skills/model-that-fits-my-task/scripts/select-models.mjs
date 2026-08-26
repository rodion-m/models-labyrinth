#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { DEFAULT_BASE, download } from "./download-snapshot.mjs";
import { parsePositiveNumber, parseScoreDimension, scoreCandidates } from "./task-fit-score.mjs";

export { scoreCandidates } from "./task-fit-score.mjs";

const CURRENT_MAX_AGE_DAYS = 730;
const FRESH_EVIDENCE_HOURS = 36;

export function parseSelectionArgs(argv) {
  const options = {
    base: DEFAULT_BASE,
    cache: undefined,
    scope: "current",
    providers: [],
    efforts: [],
    quantizations: [],
    capabilities: [],
    benchmarks: [],
    scoreDimensions: [],
    coveragePenalty: 1,
    models: [],
    minContext: 0,
    limit: 25,
  };
  const repeatable = new Map([
    ["--provider", "providers"],
    ["--effort", "efforts"],
    ["--quantization", "quantizations"],
    ["--capability", "capabilities"],
    ["--benchmark", "benchmarks"],
    ["--model", "models"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--help" || flag === "-h") return { help: true };
    const key = repeatable.get(flag);
    const value = argv[index + 1];
    if (flag === "--score") {
      if (!value) throw new Error("--score requires a value");
      options.scoreDimensions.push(parseScoreDimension(value));
      index += 1;
      continue;
    }
    if (key) {
      if (!value) throw new Error(`${flag} requires a value`);
      options[key].push(value.toLowerCase());
      index += 1;
      continue;
    }
    if (!["--base", "--cache", "--scope", "--min-context", "--limit", "--coverage-penalty"].includes(flag)) {
      throw new Error(`unknown argument: ${flag}`);
    }
    if (!value) throw new Error(`${flag} requires a value`);
    if (flag === "--base") options.base = value.replace(/\/$/, "");
    if (flag === "--cache") options.cache = value;
    if (flag === "--scope") options.scope = value;
    if (flag === "--min-context") options.minContext = parseInteger(value, flag, 0);
    if (flag === "--limit") options.limit = parseInteger(value, flag, 1);
    if (flag === "--coverage-penalty") options.coveragePenalty = parsePositiveNumber(value, flag);
    index += 1;
  }
  if (!options.cache) throw new Error("--cache is required");
  if (!new Set(["current", "all"]).has(options.scope)) throw new Error("--scope must be current or all");
  return options;
}

export function comparisonLane(observation) {
  const conditions = {
    benchmark_id: observation.benchmark_id,
    metric: observation.metric ?? null,
    unit: observation.unit ?? null,
    variant: observation.variant ?? null,
    effort: observation.effort ?? null,
    evaluator: observation.evaluator ?? null,
    dataset_version: observation.dataset_version ?? null,
    configuration: stableValue(observation.configuration ?? {}),
  };
  const parts = [
    observation.benchmark_id,
    observation.metric ?? "",
    observation.unit ?? "",
    observation.variant ?? "",
    observation.effort ?? "",
    observation.evaluator ?? "",
    observation.dataset_version ?? "",
    JSON.stringify(stableValue(observation.configuration ?? {})),
  ].join("\u001f");
  const laneId = createHash("sha256").update(parts).digest("hex").slice(0, 32);
  return { lane_id: laneId, conditions };
}

export function selectCandidates(snapshot, options) {
  const components = modelComponents(snapshot.models);
  const generatedAt = Date.parse(snapshot.generated_at);
  const candidates = [];
  for (const records of components) {
    const canonical = chooseCanonical(records);
    const offers = records.flatMap((model) => model.offers ?? []);
    const matchingOffers = offers.filter((offer) => offerMatches(offer, options));
    const activeOffers = offers.filter((offer) => offer.status === "active");
    if (options.scope === "current" && !isCurrent(records, activeOffers, generatedAt)) continue;
    if (hasOfferFilters(options) && matchingOffers.length === 0) continue;
    if (options.models.length > 0 && !matchesModel(records, options.models)) continue;

    const observations = [];
    let incompatibleObservationCount = 0;
    for (const record of records) for (const observation of record.benchmarks ?? []) {
      if (options.benchmarks.length > 0 && !options.benchmarks.includes(observation.benchmark_id.toLowerCase())) continue;
      if (!sameRelease(record, canonical)) {
        incompatibleObservationCount += 1;
        continue;
      }
      observations.push({
        ...observation,
        ...comparisonLane(observation),
        identity_record_id: record.id,
        identity_release_date: record.release_date ?? null,
      });
    }
    if (options.benchmarks.length > 0 && observations.length === 0) continue;
    candidates.push({
      canonical_model_id: canonical.id,
      name: canonical.name,
      release_date: canonical.release_date ?? null,
      record_ids: records.map((model) => model.id).sort(),
      matching_offers: matchingOffers.map(compactOffer),
      observations,
      incompatible_observation_count: incompatibleObservationCount,
    });
  }
  const scoring = scoreCandidates(candidates, options.scoreDimensions ?? [], options.coveragePenalty ?? 1);
  candidates.sort((left, right) => {
    if (scoring) {
      const scoreOrder = (right.task_fit?.aggregate_score ?? -1) - (left.task_fit?.aggregate_score ?? -1);
      if (scoreOrder !== 0) return scoreOrder;
      const confidenceOrder = (right.task_fit?.confidence ?? -1) - (left.task_fit?.confidence ?? -1);
      if (confidenceOrder !== 0) return confidenceOrder;
    }
    return String(right.release_date ?? "").localeCompare(String(left.release_date ?? ""))
      || left.canonical_model_id.localeCompare(right.canonical_model_id);
  });
  return {
    data: candidates.slice(0, options.limit),
    meta: {
      total: candidates.length,
      limit: options.limit,
      scope: options.scope,
      current_max_age_days: CURRENT_MAX_AGE_DAYS,
      generated_at: snapshot.generated_at,
      content_hash: snapshot.content_hash,
      scoring,
    },
  };
}

function modelComponents(models) {
  const parent = models.map((_, index) => index);
  const byId = new Map(models.map((model, index) => [model.id.toLowerCase(), index]));
  const root = (index) => parent[index] === index ? index : (parent[index] = root(parent[index]));
  const join = (left, right) => {
    const leftRoot = root(left);
    const rightRoot = root(right);
    if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
  };
  models.forEach((model, index) => {
    for (const alias of model.aliases ?? []) {
      const target = byId.get(String(alias.id).toLowerCase());
      if (target !== undefined) join(index, target);
    }
  });
  const groups = new Map();
  models.forEach((model, index) => {
    const key = root(index);
    const group = groups.get(key) ?? [];
    group.push(model);
    groups.set(key, group);
  });
  return [...groups.values()];
}

function chooseCanonical(records) {
  return [...records].sort((left, right) => canonicalRank(right) - canonicalRank(left) || left.id.localeCompare(right.id))[0];
}

function canonicalRank(model) {
  const active = (model.offers ?? []).filter((offer) => offer.status === "active").length;
  const identity = model.identity_confidence === "exact" ? 2 : model.identity_confidence === "alias" ? 1 : 0;
  const variantPenalty = /:batch$|:\w+$|\/.*(?:-free|-latest)$/.test(model.id) ? 1 : 0;
  return active * 100 + identity * 10 + Math.min(model.benchmarks?.length ?? 0, 9) - variantPenalty;
}

function isCurrent(records, activeOffers, generatedAt) {
  if (activeOffers.length === 0) return false;
  if (!records.some((model) => model.identity_confidence !== "unresolved")) return false;
  const dates = records.map((model) => Date.parse(model.release_date)).filter(Number.isFinite);
  if (dates.length > 0) return generatedAt - Math.max(...dates) <= CURRENT_MAX_AGE_DAYS * 86_400_000;
  const evidenceDates = activeOffers.flatMap((offer) => offer.evidence ?? [])
    .map((evidence) => Date.parse(evidence.fetched_at)).filter(Number.isFinite);
  return evidenceDates.length > 0 && generatedAt - Math.max(...evidenceDates) <= FRESH_EVIDENCE_HOURS * 3_600_000;
}

function hasOfferFilters(options) {
  return options.providers.length > 0 || options.efforts.length > 0 || options.quantizations.length > 0
    || options.capabilities.length > 0 || options.minContext > 0;
}

function offerMatches(offer, options) {
  if (offer.status !== "active") return false;
  if (options.providers.length > 0 && !options.providers.includes(String(offer.provider_id).toLowerCase())) return false;
  if (options.efforts.length > 0 && !options.efforts.some((effort) => (offer.reasoning_efforts ?? []).map((value) => value.toLowerCase()).includes(effort))) return false;
  if (options.quantizations.length > 0 && !options.quantizations.includes(String(offer.quantization ?? "").toLowerCase())) return false;
  if (options.minContext > 0 && (offer.context_tokens ?? 0) < options.minContext) return false;
  return options.capabilities.every((capability) =>
    offer.capabilities?.[capability] === true
      || (capability === "reasoning" && (offer.reasoning_efforts?.length ?? 0) > 0)
      || offer.supported_parameters?.some((parameter) => parameter.toLowerCase() === capability));
}

function matchesModel(records, requested) {
  const names = new Set(records.flatMap((model) => [model.id, ...(model.aliases ?? []).map((alias) => alias.id)]).map((id) => id.toLowerCase()));
  return requested.some((id) => names.has(id));
}

function sameRelease(record, canonical) {
  if (record.id === canonical.id) return true;
  if (!record.release_date || !canonical.release_date) return false;
  return String(record.release_date).slice(0, 10) === String(canonical.release_date).slice(0, 10);
}

function compactOffer(offer) {
  return {
    id: offer.id,
    provider_id: offer.provider_id,
    provider_model_id: offer.provider_model_id,
    variant: offer.variant ?? null,
    quantization: offer.quantization ?? null,
    context_tokens: offer.context_tokens ?? null,
    max_output_tokens: offer.max_output_tokens ?? null,
    capabilities: offer.capabilities,
    reasoning_efforts: offer.reasoning_efforts,
    supported_parameters: offer.supported_parameters,
    pricing: offer.pricing,
    runtime: offer.runtime,
    data_policy: offer.data_policy ?? null,
    evidence: offer.evidence,
  };
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, nested]) => [key, stableValue(nested)]));
  }
  return value;
}

function parseInteger(value, name, minimum) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum) throw new Error(`${name} must be an integer >= ${minimum}`);
  return parsed;
}

function usage() {
  return "Usage: node scripts/select-models.mjs --cache <directory> [--scope current|all] [--provider id] [--effort level] [--quantization type] [--capability name] [--min-context tokens] [--benchmark id] [--score benchmark-or-lane[=weight][:higher|lower]] [--coverage-penalty n] [--model id] [--limit n] [--base url]";
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseSelectionArgs(process.argv.slice(2));
    if (options.help) console.log(usage());
    else {
      const bundle = await download({ base: options.base, out: options.cache });
      const snapshot = JSON.parse(await readFile(resolve(options.cache, "snapshot.json"), "utf8"));
      const result = selectCandidates(snapshot, options);
      result.meta.bundle_reused = bundle.reused;
      console.log(JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(usage());
    process.exitCode = 1;
  }
}

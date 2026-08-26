import { strict as assert } from "node:assert";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { clearSnapshotCache, loadSnapshot } from "../src/db.js";
import { canonicalModelId, splitOpenRouterVariant } from "../src/identity.js";
import { normalizeMillionPricing, normalizeOpenRouterPricing, normalizePortkeyPricing } from "../src/price.js";
import { mergeSnapshots } from "../src/merge.js";
import { listModels, listOffers } from "../src/query.js";
import { refreshDatabase } from "../src/refresh.js";
import { writeSnapshotAtomic } from "../src/storage.js";
import { MODELS_DB_SCHEMA, assertSnapshotShape } from "../src/schema.js";
import { collectOpenRouter } from "../src/sources/openrouter.js";
import { collectBenchGecko, collectCloudPrice } from "../src/sources/enrichment.js";
import type { Snapshot, SourceRecord, SourceResult } from "../src/types.js";

test("price normalization preserves dimensions, units, zero and variable values", () => {
  const openRouter = normalizeOpenRouterPricing({ prompt: "0.0000025", completion: "0", web_search: "0.0025", request: "-1", overrides: [{ utc_days: ["saturday"], prompt: "0.000001" }] });
  assert.equal(openRouter.find((value) => value.dimension === "input")?.unit, "token");
  assert.equal(openRouter.find((value) => value.dimension === "output")?.amount_usd_per_unit, 0);
  assert.equal(openRouter.find((value) => value.dimension === "request")?.amount_usd_per_unit, null);
  assert.equal(openRouter.find((value) => value.kind === "scheduled")?.schedule?.utc_days?.[0], "saturday");
  assert.equal(normalizeMillionPricing({ input: 2.5 }).find((value) => value.dimension === "input")?.unit, "million_tokens");
  assert.equal(normalizePortkeyPricing({ pricing_config: { pay_as_you_go: { request_token: { price: 100 } } } }).find((value) => value.dimension === "input")?.amount_usd_per_unit, 1);
});

test("identity strips only explicit routing variants and refuses fuzzy joins", () => {
  assert.deepEqual(splitOpenRouterVariant("openai/gpt-4o:free"), { baseId: "openai/gpt-4o", variant: "free" });
  assert.equal(canonicalModelId({ sourceId: "openrouter", rawId: "openai/gpt-4o:free", publisher: "openai" }).id, "openai/gpt-4o");
  assert.notEqual(canonicalModelId({ sourceId: "openrouter", rawId: "openai/gpt-4o-mini", publisher: "openai" }).id, "openai/gpt-4o");
  assert.match(canonicalModelId({ sourceId: "epoch", rawId: "epoch:GPT-4o", name: "GPT-4o" }).id, /^unresolved\/epoch\//);
});

test("merge keeps one model and one offer while retaining source observations", () => {
  const first = sourceRecord("models_dev", "openai/gpt-4o", "GPT-4o", "https://models.dev/catalog.json", "models_dev:openai:gpt-4o");
  const second = sourceRecord("openrouter", "openai/gpt-4o", "GPT-4o", "https://openrouter.ai/api/v1/models", "openrouter:openai:gpt-4o");
  first.offers![0].pricing = normalizeMillionPricing({ input: 2.5 });
  second.offers![0].pricing = normalizeOpenRouterPricing({ prompt: "0.0000025" });
  const snapshot = mergeSnapshots(undefined, [result("models_dev", [first]), result("openrouter", [second])], "2026-08-26T00:00:00.000Z");
  assert.equal(snapshot.models.length, 1);
  assert.equal(snapshot.models[0].offers.length, 1);
  assert.equal(snapshot.models[0].offers[0].pricing.length, 2);
  assert.equal(snapshot.models[0].evidence.length, 2);
});

test("query filters nested offers, paginates and computes a transparent profile estimate", () => {
  const record = sourceRecord("models_dev", "openai/gpt-4o", "GPT-4o", "https://models.dev/catalog.json", "offer");
  record.offers![0].reasoning_efforts = ["low", "medium"];
  record.offers![0].pricing = normalizeMillionPricing({ input: 1, output: 2, cache_read: 0.2 });
  const snapshot = mergeSnapshots(undefined, [result("models_dev", [record])], "2026-08-26T00:00:00.000Z");
  assert.equal(listModels(snapshot, new URLSearchParams("capability=tools&limit=1")).data.length, 1);
  const offers = listOffers(snapshot, new URLSearchParams("profile=rag-long-prefix&reasoning_effort=low"));
  assert.equal(offers.data.length, 1);
  assert.equal(offers.data[0].workload_profile_id, "rag-long-prefix");
  assert.ok((offers.data[0].estimated_cost_usd ?? 0) > 0);
});

test("failed refresh never overwrites a valid previous snapshot", async () => {
  const directory = await mkdtemp(join(tmpdir(), "models-db-test-"));
  const path = join(directory, "models_db.json");
  const previous = mergeSnapshots(undefined, [result("models_dev", [sourceRecord("models_dev", "openai/gpt-4o", "GPT-4o", "https://models.dev/catalog.json", "offer")])], "2026-08-26T00:00:00.000Z");
  await writeSnapshotAtomic(path, previous);
  const before = await readFile(path, "utf8");
  await assert.rejects(() => refreshDatabase({ path, adapters: [{ source_id: "broken", url: "https://example.invalid", collect: async () => ({ source_id: "broken", url: "https://example.invalid", fetched_at: "2026-08-26T01:00:00.000Z", status: "error", records: [], error: "offline" }) }] }));
  assert.equal(await readFile(path, "utf8"), before);
  await rm(directory, { recursive: true, force: true });
});

test("snapshot cache reloads the file after its TTL", async () => {
  const directory = await mkdtemp(join(tmpdir(), "models-db-cache-test-"));
  const path = join(directory, "models_db.json");
  const first = mergeSnapshots(undefined, [result("models_dev", [sourceRecord("models_dev", "openai/gpt-4o", "GPT-4o", "https://models.dev/catalog.json", "first")])], "2026-08-26T00:00:00.000Z");
  const second = mergeSnapshots(first, [result("models_dev", [sourceRecord("models_dev", "openai/gpt-4o-mini", "GPT-4o mini", "https://models.dev/catalog.json", "second")])], "2026-08-26T01:00:00.000Z");
  let clock = 0;

  try {
    await writeSnapshotAtomic(path, first);
    const loadedFirst = loadSnapshot({ path, ttlMs: 1_000, now: () => clock });
    await writeSnapshotAtomic(path, second);
    assert.equal(loadSnapshot({ path, ttlMs: 1_000, now: () => clock }), loadedFirst);
    clock = 1_000;
    assert.ok(loadSnapshot({ path, ttlMs: 1_000, now: () => clock }).models.some((model) => model.name === "GPT-4o mini"));
  } finally {
    clearSnapshotCache();
    await rm(directory, { recursive: true, force: true });
  }
});

test("source parser accepts real OpenRouter-shaped payload with no endpoint fan-out", async () => {
  const calls: string[] = [];
  const payload = { data: [{ id: "openai/gpt-4o", canonical_slug: "openai/gpt-4o-20260801", name: "GPT-4o", context_length: 128000, architecture: { input_modalities: ["text"], output_modalities: ["text"] }, pricing: { prompt: "0.0000025", completion: "0.00001" }, supported_parameters: ["tools", "structured_outputs"], reasoning: { supported_efforts: ["low"] } }] };
  const collected = await collectOpenRouter({ includeEndpoints: false, fetchImpl: async (input) => { calls.push(String(input)); return new Response(JSON.stringify(payload), { status: 200 }); } });
  assert.equal(collected.status, "ok");
  assert.equal(collected.records.length, 1);
  assert.equal(collected.records[0].offers?.length, 0);
  assert.equal(calls.length, 1);
});

test("secondary catalog adapters follow their documented pagination", async () => {
  const calls: string[] = [];
  const fetchImpl = async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("benchgecko.ai")) {
      const page = new URL(url).searchParams.get("page");
      return new Response(JSON.stringify({ data: [{ slug: `model-${page}`, name: `Model ${page}`, provider: "Test", scores: {} }], meta: { pages: 2 } }), { status: 200 });
    }
    const token = new URL(url).searchParams.get("next_token");
    return new Response(JSON.stringify({ data: [{ id: token ? "cloud-2" : "cloud-1", name: token ? "Cloud 2" : "Cloud 1" }], pagination: { has_next: !token, next_token: token ? undefined : "next-page" } }), { status: 200 });
  };
  const benchgecko = await collectBenchGecko({ fetchImpl });
  const cloudprice = await collectCloudPrice({ fetchImpl });
  assert.equal(benchgecko.records.length, 2);
  assert.equal(cloudprice.records.length, 2);
  assert.equal(calls.filter((url) => url.includes("benchgecko.ai")).length, 2);
  assert.equal(calls.filter((url) => url.includes("cloudprice.net")).length, 2);
});

test("schema describes the snapshot and shape guard validates hashless fixtures", () => {
  assert.equal(MODELS_DB_SCHEMA.$schema, "https://json-schema.org/draft/2020-12/schema");
  assertSnapshotShape({ schema_version: "1.0", generated_at: "2026-08-26T00:00:00.000Z", content_hash: "", workload_profiles: [], sources: [], benchmarks: [], models: [] } satisfies Snapshot);
});

function result(sourceId: string, records: SourceRecord[]): SourceResult {
  return { source_id: sourceId, url: `https://${sourceId}.example`, fetched_at: "2026-08-26T00:00:00.000Z", status: "ok", records };
}

function sourceRecord(sourceId: string, rawId: string, name: string, url: string, offerId: string): SourceRecord {
  const id = rawId.toLowerCase();
  return {
    id,
    identity_confidence: "exact",
    name,
    creators: [rawId.split("/")[0]],
    aliases: [{ id: rawId, source_id: sourceId }],
    open_weights: null,
    modalities: { input: ["text"], output: ["text"] },
    capabilities: { tools: true, structured_outputs: true },
    reasoning: [],
    offers: [{ id: offerId, provider_id: "openai", provider_name: "OpenAI", provider_model_id: rawId, status: "active", supported_parameters: ["tools"], capabilities: { tools: true }, reasoning_efforts: [], pricing: [], runtime: [], measurements: [], evidence: [{ source_id: sourceId, url, fetched_at: "2026-08-26T00:00:00.000Z", status: "observed" }] }],
    benchmarks: [],
    pricing_observations: [],
    runtime_observations: [],
    measurements: [],
    evidence: [{ source_id: sourceId, url, fetched_at: "2026-08-26T00:00:00.000Z", status: "observed" }],
  };
}

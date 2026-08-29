import { strict as assert } from "node:assert";
import test from "node:test";
import { SOURCE_ADAPTERS } from "../src/sources/index.js";
import {
  collectExtractBench,
  collectParseBench,
  parseExtractBenchCsv,
  parseParseBenchCsv,
} from "../src/sources/document-benchmarks.js";

const parseCsv = [
  "Provider,Category,Overall,Tables,Charts,Content_Faithfulness,Semantic_Formatting,Visual_Grounding,Cost_Per_Page,Cost_Charts,Cost_Tables,Cost_Text,Cost_Layout,HF_Model_ID",
  "\"OpenAI GPT-5 Mini (Reasoning Minimal)\",VLM - Proprietary,46.83,69.82,30.13,82.30,45.77,6.15,0.88,0.70,1.22,0.67,0.91,",
  "Qwen3-VL-8B-Instruct,VLM - Open Weight,61.97,74.61,28.18,87.63,64.23,55.18,,,,,,Qwen/Qwen3-VL-8B-Instruct",
].join("\n");

const extractCsv = [
  "Provider,Category,Overall,Short,Medium,Long,Cost_Per_Page,Cost_Short,Cost_Medium,Cost_Long,P_Short,P_Medium,P_Long,R_Short,R_Medium,R_Long,Word_Grounding,Word_Grounding_Short,Word_Grounding_Medium,Word_Grounding_Long,Page_Grounding,Page_Grounding_Short,Page_Grounding_Medium,Page_Grounding_Long,Latency_S_Per_Doc_Short,Latency_S_Per_Doc_Medium,Latency_S_Per_Doc_Long",
  "LlamaExtract Agentic Plus,LlamaExtract,95.59,96.56,93.34,94.41,0.0811,0.0831,0.0771,0.0750,96.59,93.95,94.32,96.54,92.80,94.54,46.43,43.74,54.01,54.67,84.92,89.70,72.25,87.14,110.7,197.7,587.5",
].join("\n");

function fixtureFetch(url: string, body: string): typeof fetch {
  return async (input) => {
    assert.equal(String(input), url);
    return new Response(body, { status: 200 });
  };
}

test("ParseBench parser preserves quoted cells and the published columns", () => {
  const parsed = parseParseBenchCsv(parseCsv);
  assert.ok(parsed.headers.includes("HF_Model_ID"));
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0].Provider, "OpenAI GPT-5 Mini (Reasoning Minimal)");
  assert.equal(parsed.rows[1].HF_Model_ID, "Qwen/Qwen3-VL-8B-Instruct");
});

test("ParseBench collector keeps dimensions, effort, and normalized evaluation costs", async () => {
  const url = "https://raw.githubusercontent.com/run-llama/ParseBench/main/leaderboard.csv";
  const result = await collectParseBench({ fetchImpl: fixtureFetch(url, parseCsv) });
  assert.equal(result.status, "ok");
  assert.equal(result.replace_previous, true);
  assert.equal(result.records.length, 2);
  assert.equal(result.benchmark_definitions?.[0].id, "document.parseBench");
  assert.match(result.benchmark_definitions?.[0].description ?? "", /agent/i);

  const openai = result.records.find((record) => record.name?.includes("OpenAI GPT-5 Mini"));
  const overall = openai?.benchmarks?.find((row) => row.variant === undefined);
  assert.equal(overall?.effort, "minimal");
  assert.equal(overall?.value, 46.83);
  assert.equal(overall?.metrics?.evaluation_cost_usd_per_page, 0.0088);
  assert.equal(openai?.benchmarks?.find((row) => row.variant === "tables")?.value, 69.82);

  const qwen = result.records.find((record) => record.id === "qwen/qwen3-vl-8b-instruct");
  assert.ok(qwen);
  assert.ok(qwen.aliases?.some((value) => value.id === "Qwen/Qwen3-VL-8B-Instruct"));
  assert.ok(result.records.some((record) => record.id.startsWith("unresolved/parsebench/")));
});

test("ExtractBench parser rejects a changed required schema", () => {
  assert.throws(
    () => parseExtractBenchCsv("Provider,Category,Overall\nExample,OSS,50\n"),
    /ExtractBench CSV changed its required columns/,
  );
});

test("ExtractBench collector keeps split quality, grounding, latency, and dollar costs", async () => {
  const url = "https://raw.githubusercontent.com/run-llama/ExtractBench/main/leaderboard.csv";
  const result = await collectExtractBench({ fetchImpl: fixtureFetch(url, extractCsv) });
  assert.equal(result.status, "ok");
  assert.equal(result.records.length, 1);
  assert.equal(result.benchmark_definitions?.[0].id, "document.extractBench");
  const record = result.records[0];
  const medium = record.benchmarks?.find((row) => row.variant === "medium");
  assert.equal(medium?.value, 93.34);
  assert.equal(medium?.metrics?.precision, 93.95);
  assert.equal(medium?.metrics?.recall, 92.8);
  assert.equal(medium?.metrics?.word_grounding_f1, 54.01);
  assert.equal(medium?.metrics?.page_grounding_f1, 72.25);
  assert.equal(medium?.metrics?.latency_seconds_per_document, 197.7);
  assert.equal(medium?.metrics?.evaluation_cost_usd_per_page, 0.0771);
  assert.equal(record.benchmarks?.find((row) => row.variant === undefined)?.metrics?.evaluation_cost_usd_per_page, 0.0811);
});

test("document benchmarks are registered for the twice-daily refresh", () => {
  assert.deepEqual(
    SOURCE_ADAPTERS.filter((adapter) => ["parsebench", "extractbench"].includes(adapter.source_id)).map((adapter) => adapter.source_id),
    ["parsebench", "extractbench"],
  );
});

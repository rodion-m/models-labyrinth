import { strict as assert } from "node:assert";
import test from "node:test";
import { SOURCE_ADAPTERS } from "../src/sources/index.js";
import {
  ARENA_MODEL_CONFIGS,
  collectArena,
  collectForecastBench,
  FORECASTBENCH_BASELINE_URL,
  parseForecastBenchRows,
} from "../src/sources/model-benchmarks.js";

const forecastFixture = String.raw`
  // The collector must read only the assigned literal.
  const data = [
    {
      'Rank': 1,
      'Team': 'Example',
      'Model Organization': 'OpenAI',
      'Model': 'GPT-5.1-high',
      'Dataset': 42.5,
      'N dataset': 12,
      'Dataset 95% CI': '[30.0, 50.0]',
      'Market': 55,
      'N market': 10,
      'Market 95% CI': '[45, 65]',
      'Overall': 49.1,
      'N': 22,
      'Overall 95% CI': '[40, 57]'
    },
    {
      'Model Organization': 'ForecastBench',
      'Model': 'Public median forecast',
      'Dataset': 50,
      'Market': 50,
      'Overall': 50
    },
    {
      'Model Organization': 'ForecastBench',
      'Model': 'Naive Forecaster',
      'Dataset': 50,
      'Market': 50,
      'Overall': 50
    },
    {
      'Model Organization': 'LLM Crowd',
      'Model': 'LLM Crowd (GPT-5, Claude) geometric mean with news',
      'Dataset': 50,
      'Market': 50,
      'Overall': 50
    }
  ];
  const unrelated = [{ 'Model': 'must not be parsed' }];
`;

test("ForecastBench literal parser handles the published array without executing JavaScript", () => {
  const rows = parseForecastBenchRows(forecastFixture);
  assert.equal(rows.length, 4);
  assert.equal(rows[0].Model, "GPT-5.1-high");
  assert.equal(rows[0]["Dataset 95% CI"], "[30.0, 50.0]");
});

test("ForecastBench collector keeps model-only dimensions and excludes pseudo-baselines", async () => {
  const result = await collectForecastBench({
    fetchImpl: async (input) => {
      assert.equal(String(input), FORECASTBENCH_BASELINE_URL);
      return new Response(forecastFixture, { status: 200 });
    },
  });

  assert.equal(result.status, "ok");
  assert.equal(result.replace_previous, true);
  assert.equal(result.records.length, 1);
  assert.deepEqual(result.benchmark_definitions?.map((definition) => definition.id), [
    "forecastbench.baseline.dataset",
    "forecastbench.baseline.market",
    "forecastbench.baseline.overall",
  ]);

  const record = result.records[0];
  assert.equal(record.id, "openai/gpt-5.1");
  assert.equal(record.benchmarks?.length, 3);
  const overall = record.benchmarks?.find((row) => row.benchmark_id.endsWith(".overall"));
  assert.equal(overall?.value, 49.1);
  assert.equal(overall?.metric, "brier_index");
  assert.equal(overall?.unit, "points");
  assert.equal(overall?.effort, "high");
  assert.equal(overall?.sample_count, 22);
  assert.equal(overall?.metrics?.confidence_interval_lower, 40);
  assert.equal(overall?.metrics?.confidence_interval_upper, 57);
  assert.deepEqual(overall?.configuration, {
    track: "baseline",
    tools: false,
    scaffolding: false,
    score_direction: "higher_is_better",
  });
  assert.ok(!result.records.some((value) => /median|naive|llm crowd/i.test(value.name ?? "")));
});

test("Arena collector paginates latest overall rows and merges configurations by model", async () => {
  const requested = new Set<string>();
  const result = await collectArena({
    fetchImpl: async (input) => {
      const url = new URL(String(input));
      assert.equal(url.searchParams.get("dataset"), "lmarena-ai/leaderboard-dataset");
      assert.equal(url.searchParams.get("split"), "latest");
      assert.equal(url.searchParams.get("length"), "100");
      const config = url.searchParams.get("config");
      assert.ok(config);
      requested.add(config);
      const rows = url.searchParams.get("offset") === "0"
        ? [{
          row: {
            model_name: "Claude Opus 4.6 (high)",
            organization: "Anthropic",
            license: "Commercial",
            rating: 1288,
            rating_lower: 1276,
            rating_upper: 1300,
            variance: 144,
            vote_count: 3210,
            rank: 1,
            category: "overall",
            leaderboard_publish_date: "2026-08-28",
          },
        }]
        : [];
      return new Response(JSON.stringify({ rows }), { status: 200 });
    },
  });

  assert.equal(result.status, "ok");
  assert.equal(requested.size, ARENA_MODEL_CONFIGS.length);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].id, "anthropic/claude-opus-4.6");
  assert.equal(result.records[0].reasoning?.[0].efforts?.[0], "high");
  assert.equal(result.records[0].benchmarks?.length, ARENA_MODEL_CONFIGS.length);
  assert.equal(result.records[0].benchmarks?.[0].kind, "index");
  const styleControlled = result.records[0].benchmarks?.find((row) => row.benchmark_id === "arena.text_style_control");
  assert.equal(styleControlled?.configuration?.style_control, true);
  assert.equal(styleControlled?.metrics?.vote_count, 3210);
  assert.equal(styleControlled?.sample_count, 3210);
});

test("ForecastBench does not turn model release suffixes into token-budget variants", async () => {
  const fixture = String.raw`const data = [
    {'Model Organization': 'xAI', 'Model': 'grok-4-0709', 'Overall': 60},
    {'Model Organization': 'Anthropic', 'Model': 'claude-opus-4-6-1024', 'Overall': 59}
  ];`;
  const result = await collectForecastBench({
    fetchImpl: async () => new Response(fixture, { status: 200 }),
  });
  const grok = result.records.find((record) => record.id === "x-ai/grok-4-0709");
  const claude = result.records.find((record) => record.id === "anthropic/claude-opus-4.6");
  assert.ok(grok);
  assert.equal(grok.benchmarks?.[0].variant, undefined);
  assert.ok(claude);
  assert.equal(claude.benchmarks?.[0].variant, "token_budget_1024");
});

test("new model-level benchmark feeds are part of the twice-daily source registry", () => {
  assert.deepEqual(
    SOURCE_ADAPTERS.filter((adapter) => ["arena", "forecastbench"].includes(adapter.source_id)).map((adapter) => adapter.source_id),
    ["arena", "forecastbench"],
  );
});

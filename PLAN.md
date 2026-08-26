# Comprehensive LLM Model Data API

## Goal

Build a small, resilient TypeScript data pipeline that produces a local
`models_db.json` snapshot and exposes it as filterable API-shaped JSON. The
same snapshot must work on Vercel as dynamic serverless endpoints and on
GitHub Pages as prebuilt static JSON files.

The target is maximum useful coverage with explicit provenance, not a single
blended leaderboard. Source measurements must remain distinguishable because
pricing, benchmark methodology, runtime conditions, and model identity are
not interchangeable.

## Model-selection navigation

The repository also ships the `models-that-fits-my-task` agent skill. Its
selection flow has four bounded routes:

1. **Quick fit** discovers facets, requests compact model summaries, and opens
   full records only for a shortlist.
2. **Route fit** evaluates provider offers, reasoning effort, quantization,
   cache pricing, runtime evidence, and named or caller-supplied workload cost.
3. **Quality fit** starts from task-relevant benchmark definitions and keeps
   benchmark conditions attached to every comparison.
4. **Deep fit** downloads the full snapshot and schema for cross-field analysis
   that the API cannot express.

The API supports this flow with `/facets`, `view=summary`, exact model/provider
filters, modality gates, focused offer-level filters, and an explicit custom
workload profile. It deliberately does not expose a universal
`/recommend` score: hard constraints, trade-off weights, and evidence gaps
belong to the user's task and remain visible in the skill's decision.

## Constraints

- No database service and no runtime network dependency for API reads.
- Refresh twice daily through GitHub Actions; manual dispatch must also work.
- A failed source must not erase the last successful data from other sources.
- A refresh must be atomic: a valid previous snapshot stays in place on a
  failed or empty update.
- No API keys in the repository or generated data. Artificial Analysis is
  optional and receives `AA_API_KEY` only from the runner environment. This is
  an internal deployment, so AA observations may be included when the account
  terms permit internal use; do not expose them as an unrestricted public feed.
- Keep the implementation understandable: Node.js built-ins, TypeScript,
  minimal dependencies, small modules, and contract tests.

## Final architecture after Grok 4.6 + Opus medium reviews

```text
source adapters
    -> source records + provenance
    -> canonical model identity and merge
    -> models_db.json (canonical cache)
    -> query layer
       -> Vercel /api/v1/* handlers
       -> static public/api/v1/*.json for GitHub Pages
```

The canonical record has one model identity and contains:

- model metadata and aliases;
- capabilities and reasoning-effort support;
- provider offers, including cache pricing, batch pricing, quantization,
  context limits, supported parameters, and provider runtime metrics;
- benchmark observations, kept as source/variant/effort observations rather
  than averaged into an invented score;
- source observations for price/runtime where the source cannot identify a
  provider;
- evidence entries with source, URL, fetch time, field coverage, and status.

Source-specific conflicts are retained as evidence. A normalized canonical
field is a convenient current view, not a claim that all sources measured the
same thing.

The practice case adds a second, optional observation axis without duplicating
models: `measurements[]` are keyed by `offer_id`, `workload_profile_id`, and
`reasoning_config`. They are populated only from a real upstream feed. This
repository does not run its own probes or benchmark harness. A measurement
may contain percentile latency, throughput, cache-hit data, error/contract
failure rates, cost, sample size, and measurement metadata only when the
source publishes those facts. Negative/failed upstream observations are
retained with an explicit status and reason.

The only local computations are deterministic normalization, identity
deduplication, source-aware views, and derived cost estimates for a named
workload profile. Every derived value carries its inputs and `derived_from`;
it is never presented as a new benchmark measurement.

## Initial source set

### v1 feeds

- OpenRouter model catalog and per-provider endpoint data: prices, cache
  reads, supported parameters, reasoning efforts, quantization, uptime,
  latency, throughput, and provider coverage.
- Models.dev catalog: model specifications and provider overrides, including
  limits, modalities, reasoning, tool calls, structured output, and pricing.
- BenchLM raw snapshot files: model metadata, benchmark results, pricing,
  and speed. Speed and several quality values are explicitly attributed to
  Artificial Analysis in the source data.
- Artificial Analysis free API when `AA_API_KEY` is available: headline
  indices, median performance, and model pricing. This project is internal;
  source attribution and the account's internal-use terms still apply.
- Epoch AI public model/benchmark downloads: independent benchmark and
  model-compute metadata where the join is strong enough. It is an enrichment
  source and may remain unmatched instead of causing a risky fuzzy merge.

### Optional or derived feeds

- BenchGecko, ModelCap, and CloudPrice: optional cross-checks only. Preserve
  `derived_from` because their benchmark feeds overlap with AA/OpenRouter.
- Portkey pricing configs: optional pricing supplement for batch/audio/image/
  web-search/thinking-token dimensions; pricing only, no benchmark authority.

Excluded as independent sources: aggregators that simply re-publish
Artificial Analysis or OpenRouter data without adding provenance. They may be
added later as cross-check adapters, but must not increase apparent benchmark
independence.

## API surface

- `GET /api/v1/models` — filters, sorting, and pagination.
- `GET /api/v1/models/:id` — one canonical model.
- `GET /api/v1/providers` — provider/offer inventory.
- `GET /api/v1/benchmarks` — benchmark inventory and coverage.
- `GET /api/v1/offers` — flat endpoint/provider view for filtering by
  provider, quantization, effort, price, cache, and runtime claims.
- `GET /api/v1/profiles` — named workload-profile definitions used only for
  deterministic cost estimates; no measured performance is implied.
- `GET /api/v1/health` — snapshot age and per-source status.
- `GET /api/v1/schema` — the JSON Schema for `models_db.json`, so clients can
  download the full snapshot and implement their own filtering safely.

The query response uses a stable envelope:

```json
{
  "data": [],
  "meta": {
    "total": 0,
    "limit": 50,
    "offset": 0,
    "has_more": false,
    "updated_at": "...",
    "schema_version": "1.0"
  }
}
```

GitHub Pages receives a full static projection and cannot perform arbitrary
server-side filtering; Vercel provides the same query layer dynamically. Both
deployments expose the same `schema.json` contract.

## Resilience rules

1. Fetch each source independently with timeout, byte limits, HTTP/JSON
   validation, and bounded concurrency for endpoint fan-out.
2. Record `ok`, `error`, or `skipped` per source; `stale` is computed from
   `last_success_at`, not stored as a second state machine.
3. Merge non-empty successful records into the previous valid snapshot.
4. Preserve previous fields when a source is unavailable; expose their age in
   evidence and health metadata.
5. Refuse to replace the snapshot when all sources fail, the result has zero
   models, the model count drops below the configured safety threshold, or
   structural validation fails.
6. Sort all objects/arrays deterministically and skip the commit when the
   content hash is unchanged (with a periodic forced freshness commit).
7. Write through a temporary file followed by an atomic rename; validate
   before `git add`. The Git commit plus same-job Pages deploy is the outer
   publication transaction.
8. Cache the validated snapshot and query index in each warm API instance for
   one hour; after TTL, reload and validate `models_db.json` on the next
   request. Keep the full JSON as a static download artifact so large exports
   do not pass through a Function response.

## Test strategy

- deterministic unit tests for identity, merge, de-duplication, filtering,
  pagination, and failure preservation;
- source contract tests with small fixtures and injected fetch functions;
- static-build/API shape tests;
- opt-in live smoke tests (`LIVE_TESTS=1`) against public endpoints, with the
  Artificial Analysis test enabled only when `AA_API_KEY` exists;
- schema contract tests for the full snapshot and `/api/v1/schema` endpoint;
- no local benchmark/probe tests: this project must not claim measurements it
  did not obtain from a network source.

## Review gate

Before implementation, ask Grok 4.6 for an independent architecture and
source-contract review. Then ask Opus at medium effort to judge the proposed
trade-offs and simplify anything that is over-engineered. Incorporate both
reviews in this file under **Review findings** before writing the production
code.

## Review findings

### Grok 4.6 (completed)

- Use JSON, not SQLite: the snapshot is read-only, small enough for an
  in-memory Vercel query, and must also produce GitHub Pages JSON.
- Store observation-shaped data: one canonical model, many aliases, provider
  `offers[]`, benchmark/runtime/price observations, and provenance. Do not
  invent blended `price`, `latency`, or `overall_score` fields.
- Normalize every price to an explicit `{ amount_usd, per }` point. OpenRouter
  is per-token, Models.dev is per-million, and Portkey is cents-per-token;
  unit conversion needs golden tests.
- Cap OpenRouter endpoint fan-out (concurrency 4–8, per-run cap, retry only
  safely, preserve stale endpoint offers). A source returning HTTP 200 with an
  empty catalog is a failure. Missing rows should become `absent` before they
  are ever deleted.
- v1 should focus on OpenRouter catalog/endpoints, Models.dev, BenchLM, and
  Epoch. Secondary aggregators add useful cross-checks but little independent
  benchmark coverage; do not count their derived values as independent.
- The Artificial Analysis Free API is key-gated and its current public tier
  says internal use/no redistribution. This deployment is internal, so merge
  its observations when the account terms permit internal use; keep the key
  out of the snapshot and repository and do not silently make the deployment
  public.
- Add Actions concurrency control, a hard API page size, module-scope DB
  caching in Vercel, and deterministic tests for empty responses, unit
  conversion, stale merge, identity non-merges, and derived-source labels.

### Practice-case research (2026-08-26)

The case is directionally correct: the useful operational unit is often
`provider endpoint × reasoning configuration × workload profile`, not only a
model. Existing catalogs can provide claims and rolling gateway metrics, but
they do not provide our own per-workload cache-hit/error/contract measurements.

What is directly available and should be represented now:

- OpenRouter endpoint/catalog data: provider, quantization, supported
  parameters, data-collection/ZDR controls, cache pricing, and rolling
  percentile latency/throughput/uptime.
- OpenRouter generation usage: native prompt/completion/reasoning/cached
  token counts, cost, provider, and latency for a real request.
- Models.dev and OpenRouter: declared structured-output/tool support and
  reasoning control surfaces; declarations remain claims, not pass rates.
- Benchmarks: store dataset/variant/effort/evaluator/sample metadata whenever
  the source supplies it; never compare scores without those conditions.

What is not available as a trustworthy universal catalog field and therefore
must not be fabricated by this project:

- `cache_hit_rate` for our workload, `error_rate_under_load`,
  `respects_max_tokens`, structured-output failure rate, tool-call schema
  failure rate, or reasoning-token share by effort. These require a separately
  operated probe/benchmark process with provider credentials, controlled
  prompts, concurrency, and an explicit budget, which is outside this
  repository's scope.

Use named workload profiles as metadata (`chat-short`, `rag-long-prefix`,
`agentic-multistep`, `batch-long-output`) only when an actual observation is
present. A profile is not a score and its input/output/cache distribution
must be recorded with the observation. JSON Schema Bench and BFCL are useful
external quality sources for structured output and tool calling, but they do
not substitute for endpoint-specific behavior measurements.

The online contract review found no single public feed that combines all of
this at endpoint × effort × workload granularity. The practical source matrix
is:

| Source | What it can safely contribute |
|---|---|
| [OpenRouter models](https://openrouter.ai/docs/guides/overview/models) and [provider routing](https://openrouter.ai/docs/guides/routing/provider-selection) | endpoint offers, price dimensions, capabilities, quantization, data-policy controls, and rolling provider runtime percentiles |
| [OpenRouter generation metadata](https://openrouter.ai/docs/api/api-reference/generations/get-generation) | request-level provider, latency, native token/cache/reasoning usage and cost when an authenticated generation ID exists; not a catalog-wide feed |
| [Models.dev](https://models.dev) | model/provider facts, limits, modalities, structured output, tools, reasoning options, cache/audio/tier prices |
| [BenchLM data](https://www.benchlm.ai/data) | benchmark/price/speed snapshot; preserve its own aggregation and mark AA-derived rows |
| [Artificial Analysis Data API](https://artificialanalysis.ai/data-api/docs) | key-gated indices, median performance, and pricing; useful internally when the account tier permits it |
| [Epoch AI benchmark data](https://epoch.ai/benchmarks/use-this-data) | independent benchmark/model-compute context, with explicit attribution and conservative identity joins |
| [Portkey pricing configs](https://github.com/Portkey-AI/models) | optional extra price dimensions such as batch/cache/audio/image/search/thinking; no quality or runtime claims |
| BenchGecko, ModelCap, CloudPrice | optional derived cross-checks; never count their overlapping AA/OpenRouter values as independent measurements |

OpenRouter's cache usage and reasoning-token fields are real request metadata,
not universal per-model cache-hit or effort curves. The case-specific fields
therefore enter the database only when an upstream source publishes them; the
project will not synthesize pass/fail or load-test rates.

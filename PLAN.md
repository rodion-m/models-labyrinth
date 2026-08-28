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

The repository also ships the `model-that-fits-my-task` agent skill. Its
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

Benchmark identity follows the same rule as model identity. A benchmark has
one canonical `benchmark_id`; upstream paths are retained in
`source_benchmark_ids`, and each source's value remains a separate observation.
Named multi-benchmark indices, source-defined aggregate scores, and opaque
provider results are marked as `index`, `aggregate`, and `claim` rather than
being presented as primary benchmarks.
Aliases are merged only when they refer to the same benchmark revision; similar
families and revised datasets remain separate. `/benchmarks` groups coverage by
canonical identity and accepts `kind` and `q` filters.

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
- Speech sources: Artificial Analysis STT free WER index, Pipecat's published
  English streaming provider/model table, and Open ASR's published English and
  multilingual WER/RTFx CSVs. These are separate source observations; they do
  not become one blended speech leaderboard.
- Vals public benchmark pages: professional finance, legal, healthcare,
  education, coding, agentic, and academic results together with published
  evaluation conditions and workload spend. There is no documented public
  leaderboard read API, so the adapter reads bounded static Astro payloads
  and reports page-contract failures without erasing the prior snapshot.
- LiveBench official release tables: objective task scores across reasoning,
  coding, agentic coding, mathematics, data analysis, language, and instruction
  following, with published effort variants and optional evaluation cost/token
  metadata. Category and overall values are derived aggregates, not extra
  independent benchmark votes.
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

The model-selection skill must still propose a bounded, explicitly authorized
operational validation after choosing an offer. The default is 10 sequential
representative requests followed by 2 concurrent requests, with first-attempt
429/`Retry-After` capture. Agentic profiles must inspect any published
route-scoped cache hit rate and propose stable-prefix measurement when it is
unknown. Proposed validation is not stored as catalog evidence until the user
supplies actual observations with route, workload, sample, and time scope.

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
| [Artificial Analysis Speech to Text](https://artificialanalysis.ai/speech-to-text/non-streaming) | free overall AA-WER index; full endpoint adds provider prices/speed and per-dataset WER but is tier-gated; current methodology is English-oriented |
| [Pipecat STT Benchmark](https://github.com/pipecat-ai/stt-benchmark) | provider/model streaming semantic WER, transcript rates, and TTFS percentiles from its published English README table |
| [Hugging Face Open ASR Leaderboard](https://github.com/huggingface/open_asr_leaderboard) | public English short/long-form and multilingual WER/RTFx CSVs; the current multilingual result table has explicit German, French, Italian, Spanish, and Portuguese lanes |
| [Vals benchmarks](https://www.vals.ai/benchmarks) | professional and agentic benchmark snapshots, including task variants and published effort, harness, provider, latency, token, and workload-spend conditions; static page contract rather than a documented read API |
| [LiveBench](https://github.com/LiveBench/new-livebench) | release-versioned objective subtask scores, effort variants, category/overall aggregates, and optional evaluation cost/token metadata; official raw GitHub files rather than a separate API |
| [Epoch AI benchmark data](https://epoch.ai/benchmarks/use-this-data) | independent benchmark/model-compute context, with explicit attribution and conservative identity joins |
| [Portkey pricing configs](https://github.com/Portkey-AI/models) | optional extra price dimensions such as batch/cache/audio/image/search/thinking; no quality or runtime claims |
| BenchGecko, ModelCap, CloudPrice | optional derived cross-checks; never count their overlapping AA/OpenRouter values as independent measurements |

## Model-selection remediation plan (2026-08-27)

### Objective

Make the common model-selection path current, comparable, route-correct, and
fast without reducing the completeness of `models_db.json`. The full snapshot
remains the archival source of truth; dynamic endpoints expose a smaller,
selection-oriented view by default and require an explicit opt-in for the full
historical catalog.

### Domain terms

- **Canonical model**: one base model identity. Source spellings, punctuation
  aliases, dated snapshots, batch routes, reasoning modes, and gateway wrappers
  must not become competing base models when the source provides enough evidence
  to relate them safely.
- **Offer**: one provider-accessible route for a canonical model, including its
  provider model id, variant, status, limits, capabilities, pricing, runtime,
  quantization, policy, and reasoning controls.
- **Available scope**: the default deployability catalog. It contains canonical
  identities with at least one active, unexpired offer backed by evidence fresh
  at snapshot time. It is not a quality or recommendation class.
- **Competitive mode**: the normal task-conditioned decision. Apply hard gates
  and a relevant quality floor, then compare non-dominated offer × effort pairs
  on workload economics and operations.
- **Quality-cost Pareto mode**: after the competitive quality gate, maximize the
  explicit task-fit score and minimize complete estimated workload cost across
  concrete offers. Unknown costs stay unranked, and one winner requires a budget,
  minimum quality, or disclosed quality-to-cost preference.
- **Quality-cost-speed Pareto mode**: add median TTFT (minimize) and median
  output TPS (maximize) as separate objectives. Require both from one runtime
  observation and preserve its scope/window; model-scoped speed is not provider
  evidence.
- **Frontier mode**: only for an explicit maximum-quality request. Search only
  the task-relevant frontier cohort; report cost without admitting weaker models
  because they are cheaper.
- **All scope**: the complete historical and unresolved catalog, selected with
  `scope=all` or by downloading `snapshot.json`.
- **Comparison lane**: benchmark observations with the same canonical benchmark,
  metric, unit, variant, effort, evaluator, dataset version, and configuration.
  Different lanes must never be averaged or ranked together implicitly.

### Workstream A — core data and API (Grok 4.6)

1. Add explicit lifecycle/selection metadata derived deterministically from the
   snapshot timestamp, release date, identity confidence, active offers, and
   evidence freshness. Default `/models`, `/offers`, and `/facets` to
   `scope=available`; preserve `scope=all`, explicit release-date filters, and
   transparent scope and exclusion counts. Do not use release age as availability.
2. Make model filtering route-correct: when provider, capability, effort,
   quantization, context, runtime, cache, or supported-parameter constraints are
   supplied together, one offer must satisfy all offer-scoped constraints.
3. Strengthen conservative identity normalization for source-proven aliases that
   differ only by known punctuation/date spellings. Represent `:batch` and other
   routing/configuration suffixes as variants or offers. Do not introduce broad
   fuzzy matching; ambiguous records remain unresolved. Add regression fixtures
   for the Gemini, GPT, GLM, and Muse split identities found in the audited run.
4. Add a paginated benchmark-observations endpoint. Return a stable `lane_id` and
   allow filtering by benchmark, model, metric, unit, variant, effort, evaluator,
   dataset version, source, and scope. Sorting by score is legal only within one
   comparison lane; mixed lanes return a client error.
5. Add strict query parsing. Unknown enum values, malformed booleans/numbers/dates,
   unsupported sort keys, and incompatible argument combinations return HTTP 400
   instead of silently broadening the query. Add `sort=released`; retain
   `sort=updated` with its evidence-freshness meaning documented.
6. Make workload cost results explicit and complete for supported dimensions.
   Include cache write, cache read, request, applicable context tiers, and caller-
   supplied reasoning-token usage. If a required dimension or tier cannot be
   resolved unambiguously, return `null` plus machine-readable missing dimensions;
   never emit an optimistic total as complete.
7. Remove periodic reparsing of immutable Vercel deployment files. Generate a
   compact deterministic runtime query artifact at build time while keeping the
   complete snapshot and per-model static files. Keep module-scope parsed data and
   indexes for the lifetime of an instance; a new deployment is the invalidation.
8. Update JSON Schema, static projections, API documentation, health metadata,
   and live/unit/contract tests. Preserve the twice-daily refresh workflow and
   failure-safe snapshot semantics.

### Workstream B — agent skill (Codex)

1. Default decisions to `competitive`. Use `frontier` only when the user
   explicitly prioritizes maximum quality, `available` only as a rare inventory
   expansion, and `all` almost exclusively for explicit historical/audit work.
2. Require offer-scoped compatibility before quality ranking and require one
   comparison lane for every numeric leaderboard claim.
3. Require a same-hash health/schema/snapshot bundle. Full-snapshot work must use
   the validated downloader rather than an independent `curl`.
4. Add one offline selection script that downloads or reuses a content-hash keyed
   bundle, parses it once, resolves only source-proven aliases, groups benchmark
   observations by lane, and emits auditable candidates without a universal score.
   It also computes a strict offer-level quality-cost Pareto front for an explicit
   workload and keeps incomplete economics outside the comparable set.
   Its speed variant keeps TTFT and TPS separate and leaves incomplete runtime
   evidence unranked.
5. Forbid transferring scores across model versions and forbid manual mean/median
   aggregation across benchmark conditions. Require explicit weights and a
   sensitivity check whenever a ranked recommendation is not a pure Pareto result.
6. Update the data guide, response contract, examples, tests, edit log, skill
   review, trigger tests, duplicate audit, and transfer validation.
7. Require every recommendation to include a workload-shaped operational
   validation plan. For agentic work, require cache-hit evidence or explicit
   unknown plus a repeated-prefix real-run plan.

### Acceptance criteria

- The API defaults to freshly available canonical offers, while the skill defaults
  to a competitive task-conditioned decision and `scope=all` remains exhaustive.
- Provider plus capability/context/effort constraints cannot match across two
  different offers.
- Known punctuation/batch duplicate fixtures join without merging genuinely
  different dated versions or model families.
- Benchmark score sorting rejects mixed lanes and succeeds for an explicitly
  selected lane with preserved provenance.
- Invalid query values produce HTTP 400 and identify the invalid parameter.
- Cost estimates either account for all declared workload dimensions and tiers or
  state exactly why the total is unknown.
- The runtime API does not parse the 70 MB archival snapshot on every cold start or
  hourly TTL boundary; the full file remains downloadable.
- Health and downloaded analysis data share one `content_hash`.
- `npm run check`, focused skill tests, live deployment tests, skill review,
  trigger tests, duplicate audit, and Claude/Codex transfer tests pass.

### Integration and release

Grok works in a dedicated worktree and commits the core/API changes. Codex works
only on the canonical skill directory in the main checkout. Codex reviews and
integrates the Grok commit, resolves documentation/schema coupling, refreshes the
real snapshot if the schema or identity projection changes, runs all gates, then
commits and pushes one coherent result. Vercel deployment and the scheduled refresh
workflow are verified after the remote `main` ref moves.

OpenRouter's cache usage and reasoning-token fields are real request metadata,
not universal per-model cache-hit or effort curves. The case-specific fields
therefore enter the database only when an upstream source publishes them; the
project will not synthesize pass/fail or load-test rates.

LiveBench is integrated as a primary benchmark source. Its release table supplies
objective subtask observations with `dataset_version`, `evaluator`, and the
published effort variant; its optional cost table is retained as evaluation-run
metrics and never mistaken for a provider offer quote. Category and overall rows
are explicit derived index/aggregate observations. BenchGecko category-level
LiveBench aliases point at these canonical aggregate identities, so the same
published result is not counted as an extra independent vote.

### Task-fit score extension

The agent may publish an aggregate only after the user or playbook selects exact
comparison lanes and explicit positive weights. Each lane is normalized with a
tie-aware empirical percentile over the surviving candidates. The reported score
is `weighted observed percentile × coverage^penalty` (default penalty `1`), with
observed score, coverage, confidence, cohort size, and every contribution shown
separately. Missing evidence reduces coverage but is never relabeled as measured
zero performance. A benchmark id that resolves to multiple lanes is an error until
the agent selects one exact lane; this keeps effort, evaluator, version, metric,
and harness conditions from being blended invisibly.

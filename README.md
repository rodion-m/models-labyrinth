# Models Labyrinth

A source-aware catalog and model-selection atlas covering models, provider
routes, prices, reasoning efforts, benchmark scores, and published runtime
metrics. The snapshot is refreshed twice a day by GitHub Actions, and API
reads make no network requests.

## Model-selection skill

The repository includes [`model-that-fits-my-task`](.agents/skills/model-that-fits-my-task/SKILL.md),
an agent skill that turns a workload description into an evidence-backed model
and provider-route recommendation. It uses the filtered API for ordinary
decisions and downloads the full snapshot together with its JSON Schema only
when the comparison cannot be expressed efficiently through API filters.

The skill keeps model quality, provider behavior, quantization, price, and
evidence confidence separate until the user's task makes their trade-offs
explicit. It does not run models or invent a universal leaderboard score.
When a ranked answer is useful, its offline selector can calculate a
task-relative score from exact comparison lanes and user-visible weights. The
result always exposes observed percentile quality, benchmark coverage,
confidence, cohort size, and per-lane contributions rather than hiding them in
one opaque number.
Its business-domain playbook routes finance, legal, healthcare, education,
public-service, office, SaaS automation, customer-service, HR, IT operations,
cybersecurity, and modernization workloads to the closest available evidence,
while naming domains where the current snapshot has only weak proxy coverage.
For endpoint-level routing after an OpenRouter model slug is chosen, it links
to the maintained
[`openrouter-provider-ranking`](https://github.com/CodeAlive-AI/ai-driven-development/tree/main/skills/openrouter-provider-ranking)
skill instead of duplicating that specialized workflow.

## Architecture

```text
upstream APIs/feeds
        -> adapters with provenance and bounded fetches
        -> deterministic merge and validation
        -> models_db.json
        -> module-scope snapshot + query index
        -> Vercel /api/v1/* or static GitHub Pages projection
```

`models_db.json` remains the only complete portable snapshot. Deployments
parse a compact build-time `runtime-query.json` artifact once per Function
instance, cache the snapshot and query index for the life of that instance, and
invalidate on a new deployment. The archival JSON is not reparsed on an hourly
timer. All responses still use CDN cache headers with a one-hour TTL. The
full snapshot stays downloadable as `/api/v1/snapshot.json`.

Streaming JSON parsers and NDJSON are intentionally not used in the hot path:
an arbitrary filter still has to scan the whole array, so streaming reduces
peak materialization memory but substantially increases CPU/latency per
request. SQLite remains a reasonable option if the snapshot grows
substantially or memory limits become strict, but for the current read-only
case an indexed in-memory JSON snapshot is faster and has less operational
complexity.

## Sources

Each observation stores its `source_id`, URL, fetch time, covered fields, and
`derived_from` when a value is republished or aggregated by another source.
Conflicts are not collapsed into an invented single rating.

- [OpenRouter models](https://openrouter.ai/docs/guides/overview/models) and
  [provider routing](https://openrouter.ai/docs/guides/routing/provider-selection)
  — model catalog, prices, cache, capabilities, quantization, and rolling
  provider runtime metrics.
- [Models.dev](https://models.dev) — model/provider metadata, limits,
  modalities, tools, structured output, reasoning, and pricing.
- [BenchLM data](https://www.benchlm.ai/data) — benchmarks, pricing, and speed;
  AA-derived rows retain their provenance.
- [Artificial Analysis Data API](https://artificialanalysis.ai/data-api/docs)
  — headline indices, median performance, and pricing when `AA_API_KEY` is
  available. The key is never stored in git or the snapshot; this deployment
  is intended for internal use.
- [Vals benchmarks](https://www.vals.ai/benchmarks) — public evaluation
  snapshots for finance, legal, healthcare, education, coding, agentic, and
  academic tasks, including run-level effort, harness, provider, latency,
  token, and workload-spend fields when published. Vals has no documented
  public leaderboard read API, so the refresh reads the structured Astro page
  payloads and fails visibly if their contract changes.
- [LiveBench](https://livebench.ai) — official release-aware objective
  subtasks across reasoning, coding, agentic coding, mathematics, data
  analysis, language, and instruction following, plus published evaluation
  cost/token metadata. The adapter reads release tables from the
  [official repository](https://github.com/LiveBench/new-livebench); category
  and overall values are retained as derived aggregates, while subtasks remain
  independent benchmark observations.
- [Epoch AI](https://epoch.ai/benchmarks/use-this-data) — independent
  benchmark and model-compute context with conservative identity joins.
- [Portkey models](https://github.com/Portkey-AI/models) — pricing supplement
  for batch/cache/audio/image/search/thinking-token dimensions.
- BenchGecko, ModelCap, and CloudPrice — secondary cross-check observations;
  overlaps with AA/OpenRouter are not treated as independent benchmark
  sources.

The database contains only data from network sources. The project does not run
local benchmarks, probes, or its own error/latency/cache-hit measurements.
Therefore, `measurements[]` is populated only when an upstream source actually
publishes the corresponding facts.

## API

All collection endpoints return an envelope with `data` and `meta`:

```json
{
  "data": [],
  "meta": {
    "total": 0,
    "limit": 50,
    "offset": 0,
    "has_more": false,
    "updated_at": "...",
    "schema_version": "1.0",
    "scope": "current",
    "recency_cutoff": "...",
    "excluded_count": 0
  }
}
```

- `GET /api/v1/models?q=gpt&provider=openrouter&capability=tools&limit=50`
- `GET /api/v1/models?view=summary&capability=tools&capability=structured_outputs&sort=released&limit=100`
- `GET /api/v1/models?scope=all&released_after=2024-01-01`
- `GET /api/v1/models/:id`
- `GET /api/v1/offers?model=openai/gpt-5&provider=openrouter&capability=tools&has_runtime=true&profile=rag-long-prefix&sort=cost`
- `GET /api/v1/offers?capability=structured_outputs&profile=custom&input_tokens=10000&output_tokens=300&cached_input_ratio=0.5&cache_write_tokens=4000&reasoning_tokens=200&sort=cost`
- `GET /api/v1/facets` — discover current capability, effort, quantization, modality, and source values.
- `GET /api/v1/providers`
- `GET /api/v1/benchmarks?kind=benchmark&q=terminal` — canonical benchmark catalog; `kind` accepts `benchmark`, `index`, `aggregate`, or `claim`, while `q` also matches upstream aliases.
- `GET /api/v1/benchmark-observations?benchmark=coding.terminalBench21&effort=high` — canonical paginated observations with a stable `lane_id`. Defaults to `scope=current`. `sort=score` is allowed only inside one comparison lane.
- `GET /api/v1/profiles`
- `GET /api/v1/health`
- `GET /api/v1/schema` — JSON Schema for the complete `models_db.json`.
- `GET /api/v1/snapshot` — redirect to the full static `snapshot.json`.

`/models`, `/offers`, `/facets`, and `/benchmark-observations` default to `scope=current`: canonical models
with at least one active offer, excluding unresolved identities and releases
older than the documented 24-month recency window measured from
`generated_at`. An unknown release date is allowed only when an active offer
has fresh evidence. `scope=all` returns the complete catalog. Responses include
`meta.scope`, `meta.recency_cutoff`, and `meta.excluded_count`. `sort=updated`
orders by evidence freshness; `sort=released` orders by `release_date`.
Unknown enum values, malformed booleans/numbers/dates, unsupported sort keys,
and incompatible argument combinations return HTTP 400 with `error.parameter`.

Model filters cover id/name/alias, provider, capability, reasoning effort,
modality, quantization, source, benchmark, open weights, minimum context,
supported parameters, runtime/cache presence, release-date bounds, and sorting.
When provider, capability, effort, quantization, context, runtime, cache, or
supported-parameter constraints are supplied together, one offer must satisfy
all of them. Use `view=summary` for broad candidate discovery; fetch full
records only for the shortlist. Summary pages are capped at 100 rows;
full-record pages are capped at 10 to stay safely below serverless response
limits. Repeated or comma-separated capabilities are ANDed. Repeated
providers, efforts, quantizations, and sources are ORed. Provider values are
exact provider ids; use `/providers` to discover them.

Offer filters additionally cover supported parameters, minimum route context,
exact model ids, modalities, presence of runtime observations, presence of declared cache pricing, price
estimate, and workload profile. `sort=cost` requires a profile; `sort=context`
does not. Use `profile=custom` with required `input_tokens` and `output_tokens`
when the named profiles do not match the task; `cached_input_ratio` defaults to
zero and `requests_per_task` to one. Optional `cache_write_tokens` and
`reasoning_tokens` are supported on any profile. `estimated_cost_usd` is a
deterministic calculation from unambiguous input, output, cache-read,
cache-write, request, reasoning, and applicable context-tier prices. If a
required dimension or tier cannot be resolved, the total is `null` and
`missing_dimensions` names exactly what is missing. The estimate is not
measured cost or a latency prediction.

Benchmark observations keep comparison conditions attached. A comparison lane
is the canonical benchmark plus metric, unit, variant, effort, evaluator,
dataset version, and configuration; the API exposes it as `lane_id`. Sorting
by score is a client error unless the result set is a single comparison lane.

Vercel Functions have a 4.5 MB response-body limit, so collection pages are
limited to 100 items. For complete offline analysis, use the static
`/api/v1/snapshot.json` and `/api/v1/schema.json` on GitHub Pages or Vercel.
`vercel.json` runs the static build on deploy and includes `runtime-query.json`
in the dynamic API function bundle. The full snapshot is served as a static
file, not through a Function. When `SNAPSHOT_DOWNLOAD_URL` is set, the snapshot
redirect can point directly to a GitHub/GitHub Pages URL. Health and the
downloaded snapshot share one `content_hash`.

## Local development

```bash
npm install
npm run update:db       # network refresh; AA uses .env when configured
npm run typecheck
npm test                # deterministic tests
npm run test:live       # opt-in public API smoke tests
npm run build:static    # public/api/v1/* for GitHub Pages
```

Copy `.env.example` to `.env`. Never commit real keys:

```dotenv
AA_API_KEY=
OPENROUTER_API_KEY=
OPENROUTER_ENDPOINTS=1
OPENROUTER_ENDPOINT_CAP=120
OPENROUTER_ENDPOINT_CONCURRENCY=6
```

If a source is temporarily unavailable, its status becomes `error` or
`skipped` and previous data is preserved. An empty catalog is treated as an
error; if all sources fail, the file is not replaced. A new snapshot is
validated first, then written through a temporary file and atomic rename.

## GitHub Actions and deployment

`.github/workflows/refresh.yml` runs at `03:17` and `15:17` UTC and can also be
started manually. Add `AA_API_KEY` and, if needed, `OPENROUTER_API_KEY` as
repository or environment secrets. The workflow refreshes the data, runs the
tests, builds the static projection, commits a changed `models_db.json`, and
publishes GitHub Pages in the same job.

On Vercel, a new snapshot enters the runtime only after a new deployment. The
in-process cache lasts for the instance lifetime; a new deployment is the
invalidation. Immutable deployment files are not reparsed on a timer.

The static projection contains:

- `index.html` — the lightweight landing page;
- `labyrinth-hero.jpg` — the landing-page hero asset;
- `api/v1/snapshot.json` — complete snapshot;
- `api/v1/schema.json` — schema;
- `api/v1/models.json` and `api/v1/models/index.json` — compact model index;
- `api/v1/models/<base64url-id>.json` — individual model records;
- `api/v1/offers.json` — first page of the current-scope flat offer representation;
- `api/v1/benchmark-observations.json` — first page of current-scope observations;
- `api/v1/providers.json`, `benchmarks.json`, `profiles.json`, `facets.json`, `health.json`.
The deploy also writes `runtime-query.json` at the repository root for the
Vercel Function bundle. It is derived from the snapshot, shares `content_hash`,
and is not a second archival source of truth.

Use `models_db.json` for the complete offer list. Static `offers.json` is
intentionally limited to the same page size as the dynamic API so it does not
duplicate the large snapshot.

GitHub Pages cannot perform arbitrary server-side filtering; clients can
download the snapshot and schema and filter locally. Vercel provides the same
query layer dynamically.

## Format benchmark

A local smoke benchmark on the original snapshot before full pagination
(6,773 models, Node 24, macOS) produced the following warm-list estimates for
`provider=openai&capability=tools`. Snapshot size and catalog cardinality change
with every refresh, so these figures are comparative guidance, not an SLA:

| Option | Warm list | Characteristic |
| --- | ---: | --- |
| Full JSON + linear filter | ~1.1 ms | Simple, but scans nested offers repeatedly |
| Full JSON + query index | ~0.08 ms | Selected hot path; JSON is parsed once on cold start |
| NDJSON + streaming scan | ~77 ms | Low materialization, but scans the file for every arbitrary filter |
| SQLite + indexed facets | ~4.8 ms | Lower memory and fast id lookup, but more complex and slower for this list query |

The current `models_db.json` is roughly 60 MB on disk; a plain Node parse in a
separate process measured about 303 MB peak RSS. This is a one-time cost per
Vercel Function instance, not per request. The current Vercel Hobby static-file
limit is 100 MB. If the file grows to several hundred megabytes, the next step
is SQLite or prebuilt byte-range/index storage.

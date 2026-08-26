# Models Labyrinth

A source-aware catalog and model-selection atlas covering models, provider
routes, prices, reasoning efforts, benchmark scores, and published runtime
metrics. The snapshot is refreshed twice a day by GitHub Actions, and API
reads make no network requests.

## Model-selection skill

The repository includes [`models-that-fits-my-task`](.agents/skills/models-that-fits-my-task/SKILL.md),
an agent skill that turns a workload description into an evidence-backed model
and provider-route recommendation. It uses the filtered API for ordinary
decisions and downloads the full snapshot together with its JSON Schema only
when the comparison cannot be expressed efficiently through API filters.

The skill keeps model quality, provider behavior, quantization, price, and
evidence confidence separate until the user's task makes their trade-offs
explicit. It does not run models or invent a universal leaderboard score.

## Architecture

```text
upstream APIs/feeds
        -> adapters with provenance and bounded fetches
        -> deterministic merge and validation
        -> models_db.json
        -> module-scope snapshot + query index
        -> Vercel /api/v1/* or static GitHub Pages projection
```

`models_db.json` remains the only complete portable snapshot. The API loads it
on cold start, caches it at module scope for up to one hour, and builds a
compact index for filters and O(1) model lookup by id/alias. While the cache is
fresh, requests do not parse the JSON again; after the TTL, the next request
reloads, validates, and indexes the file. All responses use CDN cache headers
with the same one-hour TTL.

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
    "schema_version": "1.0"
  }
}
```

- `GET /api/v1/models?q=gpt&provider=openrouter&capability=tools&limit=50`
- `GET /api/v1/models?view=summary&capability=tools&capability=structured_outputs&limit=100`
- `GET /api/v1/models/:id`
- `GET /api/v1/offers?model=openai/gpt-5&provider=openrouter&capability=tools&has_runtime=true&profile=rag-long-prefix&sort=cost`
- `GET /api/v1/offers?capability=structured_outputs&profile=custom&input_tokens=10000&output_tokens=300&cached_input_ratio=0.5&sort=cost`
- `GET /api/v1/facets` — discover current capability, effort, quantization, modality, and source values.
- `GET /api/v1/providers`
- `GET /api/v1/benchmarks?kind=benchmark&q=terminal` — canonical benchmark catalog; `kind` accepts `benchmark`, `index`, `aggregate`, or `claim`, while `q` also matches upstream aliases.
- `GET /api/v1/profiles`
- `GET /api/v1/health`
- `GET /api/v1/schema` — JSON Schema for the complete `models_db.json`.
- `GET /api/v1/snapshot` — redirect to the full static `snapshot.json`.

Model filters cover id/name/alias, provider, capability, reasoning effort,
modality, quantization, source, benchmark, open weights, minimum context, and sorting.
Use `view=summary` for broad candidate discovery; fetch full records only for
the shortlist. Repeated or comma-separated capabilities are ANDed. Repeated
providers, efforts, quantizations, and sources are ORed. Provider values are
exact provider ids; use `/providers` to discover them.

Offer filters additionally cover supported parameters, minimum route context,
exact model ids, modalities, presence of runtime observations, presence of declared cache pricing, price
estimate, and workload profile. `sort=cost` requires a profile; `sort=context`
does not. Use `profile=custom` with required `input_tokens` and `output_tokens`
when the named profiles do not match the task; `cached_input_ratio` defaults to
zero and `requests_per_task` to one. `estimated_cost_usd` is only a deterministic
calculation from unambiguous fixed input/output, cache-read, and request prices.
It assumes a warm cache and excludes cache writes, thinking tokens, tiered or
scheduled prices, and non-token media. Unknown or conflicting prices return
`null`; the estimate is not measured cost or a latency prediction.

Vercel Functions have a 4.5 MB response-body limit, so collection pages are
limited to 100 items. For complete offline analysis, use the static
`/api/v1/snapshot.json` and `/api/v1/schema.json` on GitHub Pages or Vercel.
`vercel.json` runs the static build on deploy and includes `models_db.json` in
the dynamic API function bundle. The full snapshot is served as a static file,
not through a Function. When `SNAPSHOT_DOWNLOAD_URL` is set, the snapshot
redirect can point directly to a GitHub/GitHub Pages URL.

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
one-hour TTL prevents indefinite caching inside a long-lived instance, but it
cannot change files in an immutable deployment by itself.

The static projection contains:

- `index.html` — the lightweight landing page;
- `labyrinth-hero.jpg` — the landing-page hero asset;
- `api/v1/snapshot.json` — complete snapshot;
- `api/v1/schema.json` — schema;
- `api/v1/models.json` and `api/v1/models/index.json` — compact model index;
- `api/v1/models/<base64url-id>.json` — individual model records;
- `api/v1/offers.json` — first page of the flat offer representation;
- `api/v1/providers.json`, `benchmarks.json`, `profiles.json`, `facets.json`, `health.json`.

Use `models_db.json` for the complete offer list. Static `offers.json` is
intentionally limited to the same page size as the dynamic API so it does not
duplicate the large snapshot.

GitHub Pages cannot perform arbitrary server-side filtering; clients can
download the snapshot and schema and filter locally. Vercel provides the same
query layer dynamically.

## Format benchmark

A local smoke benchmark on the original snapshot before full pagination
(6,773 models, Node 24, macOS) produced the following warm-list estimates for
`provider=openai&capability=tools`. The current refresh contains 10,334 models,
so these figures are comparative guidance, not an SLA:

| Option | Warm list | Characteristic |
| --- | ---: | --- |
| Full JSON + linear filter | ~1.1 ms | Simple, but scans nested offers repeatedly |
| Full JSON + query index | ~0.08 ms | Selected hot path; JSON is parsed once on cold start |
| NDJSON + streaming scan | ~77 ms | Low materialization, but scans the file for every arbitrary filter |
| SQLite + indexed facets | ~4.8 ms | Lower memory and fast id lookup, but more complex and slower for this list query |

The current `models_db.json` is about 53 MB on disk; a plain Node parse in a
separate process measured about 303 MB peak RSS. This is a one-time cost per
Vercel Function instance, not per request. The current Vercel Hobby static-file
limit is 100 MB. If the file grows to several hundred megabytes, the next step
is SQLite or prebuilt byte-range/index storage.

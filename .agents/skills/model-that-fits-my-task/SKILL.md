---
name: model-that-fits-my-task
description: Select and compare AI models, providers, routes, quantizations, and reasoning efforts for a concrete workload using current Models Labyrinth evidence. Use when a user asks which model or provider to use, wants a quality-speed-cost trade-off, or needs alternatives under capability, context, structured-output, privacy, or budget constraints. Do not use for generic model news or for benchmarking models locally.
---

# Model That Fits My Task

Use Models Labyrinth as an evidence source, then make a task-specific decision. Recommend a deployable `model × provider offer × configuration` when the data supports it; otherwise separate the model recommendation from the provider recommendation.

## Endpoints

- Filtered routes (Vercel only): `https://models-labyrinth.vercel.app/api/v1`
- Static downloads (not a query API): `https://rodion-m.github.io/models-labyrinth/api/v1`
- Full snapshot: `https://rodion-m.github.io/models-labyrinth/api/v1/snapshot.json`
- JSON Schema: `https://rodion-m.github.io/models-labyrinth/api/v1/schema.json`

Use Vercel for `/health`, `/facets`, `/models`, `/offers`, `/benchmarks`, `/providers`, and `/profiles`. GitHub Pages serves only prebuilt `.json` files and cannot apply query filters. Check Vercel `/health` before analysis. Report `generated_at` and any relevant source marked stale or failed. Do not silently substitute old or unavailable data.

## Decision workflow

1. Translate the request into hard constraints and preferences. Typical axes are task type, modalities, minimum context, structured output or tools, reasoning effort, latency, throughput, price, cache economics, privacy, open weights, provider availability, and acceptable quantization.
2. If a missing constraint could reverse the choice, ask one focused question. Otherwise state the assumptions and continue.
3. Choose the narrowest route below, then apply hard constraints before comparing preferences.

| User need | Route | Start with | Escalate when |
| --- | --- | --- | --- |
| “Which model should I use?” | **Quick fit** | `/facets`, then `/models?view=summary` | Relevant quality evidence is not visible in the shortlist. |
| “Which provider/route/effort?” | **Route fit** | `/offers` with model, capability, context, effort, quantization, cache, runtime, and workload-profile filters | Quality and route evidence must be joined across several observations. |
| “Best for coding/agents/math/etc.” | **Quality fit** | `/benchmarks`, summary candidates, then complete model records | Benchmark variants or sources require an offline comparison. |
| “Compare everything / custom constraints” | **Deep fit** | Full snapshot plus schema | Never escalate further; report missing published evidence. |

## Decision playbook

Prioritize evidence in this order: a current benchmark that reproduces the task, then a close task-family benchmark, then an older coverage anchor. Use `kind=benchmark` for primary comparisons. An `index` is context, while an `aggregate` or `claim` is not independent ranking evidence. After choosing models for quality, evaluate provider offers separately for latency, throughput, price, context, cache, policy, quantization, and supported parameters. Confirm current IDs through `/benchmarks?kind=benchmark`; the examples below are a reading order, not a fixed allowlist.

| Workload | Quality evidence to prioritize | Operational evidence to prioritize |
| --- | --- | --- |
| Production repository work | FrontierCode 1.1, DeepSWE v1.1, SWE-Rebench, FrontierSWE; Terminal-Bench 3 for terminal-heavy work | SWE-bench Verified/Pro and Terminal-Bench 2.1 are coverage anchors; hold scaffold, repo revision, tools, timeout, and verifier constant |
| Algorithms or isolated code | LiveCodeBench v6/Pro, SciCode, ProgramBench; Codeforces only for the matching contest workload | Output price, throughput, effort, compiler/runtime, pass@k, and data cutoff |
| Tool and MCP workflows | Toolathlon-Verified, MCP-Atlas, τ³-bench; BFCL v4 for call/schema mechanics | Exact tools and parameters, service state, retries, route uptime/latency, context growth, and cache economics |
| Desktop/mobile computer use | OSWorld 2.0, MobileWorld, WebArena-Verified; ScreenSpot-Pro only for UI grounding | VM/app release, vision/action interface, state reset, evaluator, and task success rather than click accuracy |
| Math and abstract reasoning | FrontierMath V2 Tiers 1–3/Tier 4, AIME/HMMT/IMO 2026, ARC-AGI-3, CritPt | Keep Python/tool access, effort, token budget, contest year, answer extractor, and interactive budget fixed |
| Research, science, or factual QA | AA-Omniscience for accuracy/hallucination/abstention, CritPt/FrontierScience for science, HLE/GPQA as anchors; BrowseComp only when browsing is part of the task | Citations/search tools, factuality versus abstention, grader, freshness, context, and domain coverage |
| Finance and financial analysis | Vals Finance Agent v2 for end-to-end analyst work, CorpFin v2 for long credit agreements, and EMB for spreadsheet modeling; TaxEval v2 and MortgageTax for their exact document workflows | Tool/harness access, source-document modality, task-level API spend, latency, effort, provider, and output auditability |
| Legal and regulated professional work | Vals Legal Research Bench for research, Harvey LAB for document/spreadsheet/presentation work, CaseLaw v2 and LegalBench for narrower legal reasoning; MedCode/MedScribe for healthcare administration | Jurisdiction and dataset version, private/public split, citations, tool access, privacy policy, structured output, and human-review requirements |
| Education and public-service workflows | Vals SAGE for educational assessment and Public Benefits Bench for benefits navigation; use a domain-specific benchmark before broad knowledge scores | Population/domain match, rubric and judge, factual grounding, accessibility, privacy, and failure cost |
| Structured output and extraction | SOB value accuracy; LiquidExtract Schema F1 + JSON Validity + VLM Judge; IFBench/IFEval only for general constraint following | `structured_outputs` and exact route parameter, modality, schema complexity, parser, retries, latency, and cost |
| Long-context and RAG | MRCR v2 with the matching context bin, CorpusQA 1M, GraphWalks 128K, AA-LCR; domain QA second | Advertised window is not retrieval quality: hold packing, position, retrieval/oracle access, truncation, TTFT, and cache pricing fixed |
| Documents, OCR, charts, and UI | OCRBench V2, OmniDocBench 1.5, OfficeQA Pro/GDP.pdf, CharXiv, ScreenSpot-Pro, Vision2Web; MMMU-Pro for broad coverage | Original PDF versus rendered pages, OCR/parser/tools, image limits/pricing, judge, and version |
| Multilingual work | MMLU-ProX, INCLUDE, NOVA-63, Global-MMLU, MILU, MaXIFE; SWE-bench Multilingual for repository work | Exact languages, native versus translated items, prompt language, aggregation, tokenizer cost, and route availability |
| Creative or subjective writing | Direct writing/preference evaluations such as Lech-Mazur or relevant arena evidence; broad intelligence last | Style/context needs, output length and price. Treat preference scores as audience-dependent |

Do not optimize a proxy past the task: GPQA is not an agent benchmark, IFEval is not schema reliability, ScreenSpot is not computer-use success, LiveCodeBench is not repository maintenance, and advertised context is not retrieval quality. Do not mix releases such as ARC-AGI 1/2/3, Terminal-Bench 2.0/2.1/3, OSWorld/Verified/2.0, FrontierMath legacy/V2, or tool/no-tool lanes. When no close benchmark exists, say so and lower confidence instead of synthesizing a universal score.

### Quick fit

Discover valid values through `/facets`; do not guess capability or modality names. Query `/models?view=summary&limit=100` with hard filters. Repeated or comma-separated `capability` and `modality` values are all required; repeated providers, efforts, quantizations, and sources are alternatives. `provider` means an exact provider id. A page is not a ranking: if `meta.has_more`, tighten constraints or follow at most three pages before reporting truncation or escalating. Prefer `identity_confidence=exact`; ignore obvious router aliases whose ids begin with `-` or `~` unless they are relevant. Fetch complete records only for the surviving shortlist.

### Route fit

Use `/offers` because quantization, provider context, supported parameters, runtime, cache pricing, and reasoning effort belong to a route. Filter an exact shortlist with repeated `model` ids; `q` is only substring search. Other filters include `provider`, `modality`, `capability`, `supported_parameter`, `reasoning_effort`, `quantization`, `source`, `min_context`, `has_runtime`, `has_cache_pricing`, `profile`, `max_cost_usd`, `sort`, `limit`, and `offset`. For a known workload use `profile=custom` with required `input_tokens` and `output_tokens`; `cached_input_ratio` defaults to `0` and `requests_per_task` to `1`. `sort=cost` and `max_cost_usd` require either a named or custom profile; `sort=context` does not.

### Quality fit

Use `/benchmarks?kind=benchmark` to find canonical IDs and source coverage, then filter candidates by `benchmark`. Search aliases with `q`; old upstream IDs remain valid model filters. Inspect complete model records through `/models/{url-encoded-id}`. Use indices only as labeled composites and exclude `aggregate` and `claim` rows from quality ranking. Never rank unlike benchmark variants as if they shared one scale.

### Deep fit

Escalate when the API cannot express the cross-field comparison, pagination would omit plausible candidates, or detailed observations are needed. Download the schema with the snapshot. Run `node scripts/download-snapshot.mjs --out <temporary-directory>` from this skill directory, or fetch both URLs directly.

Finally compare survivors on a small task-relevant set of axes. Prefer a Pareto comparison over an invented universal score. If weights are necessary, expose them and test whether a close recommendation changes under reasonable reweighting. Return one primary recommendation and usually two purposeful alternatives: a value option and a fallback emphasizing a different trade-off.

## Evidence rules

- Treat absent data as unknown, never as zero, false, unsupported, or poor performance.
- A capability such as `structured_outputs: true` is a provider/model declaration, not a measured schema-adherence rate. Prefer a matching published measurement or benchmark when present; otherwise label it “declared support only.”
- Keep benchmark variant, effort, evaluator, dataset version, unit, and source attached to the score. Compare like with like. Do not average overlapping secondary sources into extra confidence.
- Treat Vals `cost_per_test` and `api_cost_usd` as spend observed for that benchmark workload, not token-list pricing. Its provider, harness, effort, temperature, and token-limit fields describe evaluation conditions; they do not assert that the same route is currently purchasable.
- Treat `benchmark_id` as canonical and `source_benchmark_ids` as upstream aliases. Multiple observations of one canonical benchmark are provenance, not extra votes.
- Provider runtime observations apply only to their stated scope and window. Model-level quality does not prove route-level latency; route-level speed does not prove quality.
- Quantization belongs to an offer. Do not transfer an unquantized score to a quantized route without saying that the quality impact is unknown.
- Price comparisons must include the relevant dimensions: input, output, cache read/write, reasoning or thinking tokens, requests, and any tiers. API estimates cover fixed input/output prices, cache reads, and request charges. They assume a warm cache and exclude cache writes, thinking tokens, tiered/scheduled prices, and non-token media; label these omissions and calculate separately when material. A `null` estimate is unknown, not expensive or free.
- Prefer `observed` evidence over `derived`; follow `derived_from` to avoid double counting. Surface conflicts instead of resolving them by intuition.
- Do not run model probes or spend provider credits. This skill relies strictly on published network data and transparent calculations from it.

Read [references/data-guide.md](references/data-guide.md) when interpreting fields, building an offline query, or judging evidence quality.

## Response contract

Lead with the decision. For each recommended route include:

- exact model, provider, provider model id, quantization, and reasoning effort when known;
- why it fits this task, tied to the user’s constraints;
- relevant quality, speed, context, price/cache, and capability evidence with source and freshness;
- the important trade-off or uncertainty;
- a direct Models Labyrinth record or query URL where practical.

End with the assumptions and material data gaps. Avoid false precision: use ranges or qualitative confidence when sources are not directly comparable.

# Benchmark decision playbook

Read this reference when choosing quality evidence for a general workload. Confirm current canonical IDs through `/benchmarks?kind=benchmark&q=<name>`; benchmark names are a reading order, not a fixed allowlist.

## Evidence order

Prefer a current benchmark that reproduces the task, then a close task-family benchmark, then an older coverage anchor. Never optimize a proxy past its scope: GPQA is not an agent benchmark, IFEval is not schema reliability, ScreenSpot is not computer-use success, LiveCodeBench is not repository maintenance, and advertised context is not retrieval quality.

| Workload | Quality evidence to prioritize | Conditions to preserve |
| --- | --- | --- |
| Production repository work | FrontierCode 1.1, DeepSWE v1.1, SWE-Rebench, FrontierSWE; Terminal-Bench 3 for terminal-heavy work | Repository revision, scaffold, tools, timeout, verifier; SWE-bench Verified/Pro and Terminal-Bench 2.1 are coverage anchors |
| Algorithms or isolated code | LiveCodeBench v6/Pro, SciCode, ProgramBench; Codeforces only for matching contest work | Compiler/runtime, pass@k, cutoff, effort, token budget, output price |
| Tool and MCP workflows | Toolathlon-Verified, MCP-Atlas, τ³-bench; BFCL v4 for call/schema mechanics | Exact tools, service state, parameters, retries, context growth, route uptime and latency |
| Desktop/mobile computer use | OSWorld 2.0, MobileWorld, WebArena-Verified; ScreenSpot-Pro only for grounding | VM/app release, vision/action interface, state reset, evaluator, task success |
| Math and abstract reasoning | FrontierMath V2 Tiers 1–3/Tier 4, AIME/HMMT/IMO 2026, ARC-AGI-3, CritPt | Python/tools, effort, token or interaction budget, contest year, answer extractor |
| Research, science, factual QA | AA-Omniscience for accuracy/hallucination/abstention; CritPt/FrontierScience; HLE/GPQA as anchors; BrowseComp only with browsing | Search and citations, freshness, grader, abstention policy, context, domain coverage |
| Structured output and extraction | SOB value accuracy; LiquidExtract Schema F1, JSON Validity, and VLM Judge; IFBench/IFEval only for general constraints | Exact route parameter, modality, schema complexity, parser, retries, latency, cost |
| Long context and RAG | MRCR v2 matching the context bin, CorpusQA 1M, GraphWalks 128K, AA-LCR; domain QA second | Packing, position, retrieval/oracle access, truncation, TTFT, cache economics |
| Documents, OCR, charts, UI | OCRBench V2, OmniDocBench 1.5, OfficeQA Pro/GDP.pdf, CharXiv, ScreenSpot-Pro, Vision2Web; MMMU-Pro for breadth | Original files versus renders, OCR/parser/tools, image limits and pricing, judge, version |
| Multilingual work | MMLU-ProX, INCLUDE, NOVA-63, Global-MMLU, MILU, MaXIFE; SWE-bench Multilingual for repositories | Exact languages, native versus translated items, prompt language, aggregation, tokenizer cost |
| Creative or subjective writing | Direct writing/preference evaluations such as Lech-Mazur or a relevant arena | Audience and style, output length, judge population; preference scores are audience-dependent |

For finance, legal, healthcare, education, public services, office artifacts, SaaS automation, customer service, HR, IT operations, cybersecurity, consulting, or modernization, return to the route map and use the business-domain playbook instead.

## Release boundaries

Do not mix ARC-AGI 1/2/3, Terminal-Bench 2.0/2.1/3, OSWorld/Verified/2.0, FrontierMath legacy/V2, τ-bench releases or domains, or tool/no-tool lanes. Keep benchmark releases distinct unless the catalog explicitly represents a metric, evaluator, or variant of one canonical release.

When no close benchmark exists, say so and lower confidence instead of synthesizing a universal score. Use broad evidence only as a tie-breaker or prior, never as proof of performance on an uncovered workflow.

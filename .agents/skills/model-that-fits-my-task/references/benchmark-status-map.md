# Benchmark status map

Use this map before selecting any quality signal. It is a decision policy, not
a leaderboard. Last reviewed: 2026-08-27.

## Modernity gate

A benchmark is eligible by default only when its current release still
discriminates among relevant models, its evaluator measures the claimed task,
and its exact model, harness, tools, effort, budget, and dataset version can be
preserved. A new model score does not make an old benchmark current.

Classify evidence as follows:

- **Primary current** — suitable as a leading signal for the stated workload.
- **Current qualified** — useful, but private, vendor-run, harness-dependent,
  narrow, or not yet independently established. Pair it with another signal.
- **Task-specific** — valid only for the named sub-capability.
- **Coverage anchor** — older, saturated, contaminated, or methodologically
  disputed. Use only when current primary coverage is absent and label it.
- **Legacy** — exclude from default discovery, scoring, and prose. Use only for
  historical model comparison or when the user explicitly requests its exact
  task or harness.

Before assigning a status to an unlisted benchmark, check its current official
methodology and leaderboard. Judge freshness, task fidelity, contamination,
evaluator validity, reproducibility, coverage, and model-versus-harness
attribution. Popularity and citation count are not quality gates.

## Coding and software-engineering map

| Benchmark | Default status | What it actually measures | Use and limits |
| --- | --- | --- | --- |
| [DeepSWE v1.1](https://deepswe.datacurve.ai/) | **Primary current** | Original long-horizon repository tasks with isolated behavioral verification | Lead signal for autonomous repository implementation. Preserve scaffold, effort, steps, token budget, and cost. Its 113-task source-operated set is current but not universal. |
| [SWE-rebench v2](https://swe-rebench.com/about) | **Primary current** | Fresh, time-windowed GitHub issue resolution under a standardized scaffold | Lead signal for bug fixing and issue-to-patch work. Keep the task window and run statistic. Automatically mined tasks can vary in specification quality. |
| [FrontierCode 1.1](https://cognition.com/frontiercode) Main/Extended | **Current qualified** | Whether a maintainer would merge a change: correctness, tests, scope, style, and repository conventions | Strong signal for production-quality changes. Tasks are private and grading includes rubrics, so treat it as source-run and harness-dependent; do not equate its score with test-only pass rate. Diamond is deprecated. |
| [Terminal-Bench 3.0](https://www.frontierbench.ai/announcement) | **Primary current** for terminal agents | Long-running coding and non-coding work in terminal environments across multiple domains | Use for terminal-heavy agents, not as pure repository-coding evidence. Preserve release, environment, harness, timeout, effort, cost, and tokens. It supersedes 2.x for frontier selection. |
| FrontierSWE | **Current qualified** | Current repository-level software-engineering tasks | Use only when the exact current protocol and comparable lane are available. Do not merge it with other SWE families by name. |
| LiveBench Agentic Coding, current dated release | **Current qualified** | Release-scoped agentic coding tasks within LiveBench | Useful cross-check when the exact subtask matches. Do not use category or overall aggregates as extra votes. |
| [IDE-Bench](https://github.com/AfterQuery/ide-bench) | **Current qualified** | IDE-native agent work across real cross-stack tasks | Useful for IDE workflows, but newer and less established than the leading repository suites. Preserve the IDE tool interface and harness. |
| CursorBench | **Current qualified, vendor claim** | Proprietary tasks sampled from Cursor coding sessions | Supporting evidence for Cursor-specific use only. It is internal and vendor-operated; never let it lead an independent general ranking. |
| [LiveCodeBench v6 / Pro](https://livecodebench.github.io/) | **Primary current** for algorithms | Fresh contest-style code generation and related isolated coding tasks | Lead signal for competitive programming and isolated algorithm implementation. It does not measure repository navigation, maintenance, architecture, or mergeability. Preserve cutoff, language, pass@k, effort, and runtime. |
| SciCode / AA-SciCode | **Task-specific** | Scientific coding and research-programming tasks | Use for scientific-computing workloads, not general coding. Keep tools and domain split. |
| KernelBench / KernelBench Hard | **Task-specific** | Generation and optimization of GPU kernels | Use only for GPU/kernel work. Correctness, hardware, compiler, and speedup metric are inseparable. |
| Vibe Code Bench / VIBE V2 / VIBE-Pro / App-Bench | **Task-specific** | End-to-end app or web-development generation under a particular harness and judge | Use when the deliverable matches. Preserve visual/runtime judge, framework, browser, and task version; do not transfer to repository maintenance. |
| BigCodeBench | **Task-specific** | Function-level instruction following and library/API use | Useful for isolated implementation with dependencies. It is not an agentic repository benchmark and should not lead a frontier coding recommendation. |
| ProgramBench | **Task-specific** | Behavioral reimplementation from black-box observations | Use for black-box reconstruction only, not ordinary coding, migration, or repository repair. |
| SWE-bench Pro | **Coverage anchor** | Repository issue resolution on a broader SWE-bench family set | Do not use as primary evidence: a 2026 audit estimated substantial broken-task incidence and retracted an earlier recommendation. Use only with explicit caveats and stronger current evidence. |
| SWE-bench Verified | **Legacy** for frontier selection | A 500-task curated subset of the original SWE-bench | Exclude by default because current frontier results are contaminated and many remaining failures reflect flawed tests rather than capability. Historical comparison only. |
| Terminal-Bench 2.0 / 2.1 | **Coverage anchor** | Earlier terminal-agent releases | Use only for models absent from 3.0 or historical comparisons. Do not combine 2.x and 3.0 scores. |
| HumanEval / MBPP / old EvalPlus lanes | **Legacy** | Small function synthesis and unit-test passing | Historical floor checks only. They do not distinguish current frontier coding systems or model repository work. |
| Aider Polyglot | **Legacy, Aider-specific** | 225 Exercism exercises plus compliance with Aider's chosen edit format, commonly with retries | Never discover, score, or cite it by default. Use only when the user explicitly asks about old-model comparison, Aider compatibility, or edit-format behavior and no current direct evidence answers that question. It is not evidence for modern repository or agentic coding. |

## Default coding evidence by deliverable

| Deliverable | Start here | Usually exclude |
| --- | --- | --- |
| Autonomous repository change | DeepSWE v1.1 + SWE-rebench v2; add FrontierCode 1.1 for mergeability | Aider Polyglot, HumanEval, generic LiveCodeBench |
| Terminal or DevOps agent | Terminal-Bench 3.0; add the exact domain benchmark | Terminal-Bench 2.x unless coverage is missing |
| IDE coding assistant | IDE-Bench plus a current repository benchmark; CursorBench only as a vendor-specific cross-check | Function-only benchmarks as primary evidence |
| Competitive or isolated algorithm code | LiveCodeBench v6/Pro | SWE suites unless repository work is also required |
| Scientific code | SciCode plus a current relevant reasoning/domain benchmark | Generic coding aggregates |
| GPU kernels | KernelBench matching hardware and metric | General coding benchmarks |
| App or UI generation | Current VIBE/App benchmark matching the stack and judge | Repository bug-fix benchmarks as proof of visual/product quality |

## Evidence hygiene

- Cite only benchmarks that materially changed the decision. Do not emit a
  benchmark survey or list every available score.
- Prefer two complementary current signals over a large blended score. The
  closest end-to-end benchmark gets the largest weight.
- Never silently backfill a missing current score with a legacy benchmark.
  Report the coverage gap and lower confidence.
- If web research discovers a benchmark absent from this map, do not recommend
  from memory. Read its official methodology, current release, and limitations,
  then classify it before use.
- Re-review this map when a benchmark changes major version, is audited,
  saturates, stops updating, or materially changes its evaluator.

## Primary audit evidence

- OpenAI, [why SWE-bench Verified no longer measures frontier coding](https://openai.com/index/why-we-no-longer-evaluate-swe-bench-verified/)
- OpenAI, [audit of noise in coding evaluations](https://openai.com/index/separating-signal-from-noise-coding-evaluations/)
- FrontierBench, [Terminal-Bench 3.0 announcement](https://www.frontierbench.ai/announcement)
- Cognition, [FrontierCode 1.1 methodology revision](https://cognition.com/blog/frontier-code-1.1)
- DeepSWE, [current leaderboard and release](https://deepswe.datacurve.ai/) and [changelog](https://deepswe.datacurve.ai/changelog)
- SWE-rebench, [methodology](https://swe-rebench.com/about)
- Aider, [Polyglot methodology and leaderboard](https://aider.chat/docs/leaderboards/)

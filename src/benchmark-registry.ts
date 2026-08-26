import type { BenchmarkDefinition, BenchmarkKind, BenchmarkObservation } from "./types.js";

// Only aliases that are known to name the same benchmark/version belong here.
// Similar benchmark families and different revisions must remain separate.
const ALIASES = new Map<string, string>([
  ["benchgecko.aa-agentic-index", "agentic.aaAgenticIndex"],
  ["artificial_analysis.agentic_index", "agentic.aaAgenticIndex"],
  ["artificial_analysis.artificial_analysis_agentic_index", "agentic.aaAgenticIndex"],
  ["benchgecko.aa-coding-index", "coding.aaCodingIndex"],
  ["artificial_analysis.coding_index", "coding.aaCodingIndex"],
  ["artificial_analysis.artificial_analysis_coding_index", "coding.aaCodingIndex"],
  ["artificial_analysis.intelligence_index", "artificial_analysis.intelligenceIndex"],
  ["artificial_analysis.artificial_analysis_intelligence_index", "artificial_analysis.intelligenceIndex"],
  ["benchgecko.apex-agents", "agentic.apexAgents"],
  ["benchgecko.browsecomp", "agentic.browseComp"],
  ["benchgecko.cybench", "agentic.cybench"],
  ["benchgecko.mcp-atlas", "agentic.mcpAtlas"],
  ["benchgecko.osworld", "agentic.osWorld"],
  ["agentic.deepswe", "coding.deepSwe"],
  ["agentic.frontierbench", "coding.frontierBench"],
  ["agentic.terminalbench2", "coding.terminalBench2"],
  ["agentic.terminalbench21", "coding.terminalBench21"],
  ["agentic.terminalbench3", "coding.terminalBench3"],
  ["benchgecko.posttrainbench", "coding.postTrainBench"],
  ["benchgecko.swe-bench-verified", "coding.sweVerified"],
  ["benchgecko.swe-bench-pro", "coding.swePro"],
  ["benchgecko.swe-bench-multilingual", "coding.sweMultilingual"],
  ["benchgecko.swe-bench-multimodal", "coding.sweMultimodal"],
  ["benchgecko.oc-livecodebenchv6", "coding.liveCodeBenchV6"],
  ["benchgecko.oc-aime2025", "math.aime2025"],
  ["benchgecko.oc-gpqa-diamond", "knowledge.gpqaDiamond"],
  ["benchgecko.oc-hle", "knowledge.hle"],
  ["benchgecko.oc-ifeval", "instructionFollowing.ifeval"],
  ["benchgecko.oc-mmlu-pro", "knowledge.mmluPro"],
  ["benchgecko.hf-bbh", "reasoning.bbh"],
  ["benchgecko.hf-gpqa", "knowledge.gpqa"],
  ["benchgecko.hf-ifeval", "instructionFollowing.ifeval"],
  ["benchgecko.hf-mmlu-pro", "knowledge.mmluPro"],
  ["benchgecko.helm-gpqa", "knowledge.gpqa"],
  ["benchgecko.helm-ifeval", "instructionFollowing.ifeval"],
  ["benchgecko.helm-mmlu-pro", "knowledge.mmluPro"],
  ["benchgecko.frontiermath-tier-4-v2-private", "math.frontierMathV2Tier4"],
  ["benchgecko.frontiermath-tiers-1-3-v2-private", "math.frontierMathV2Tiers13"],
  ["benchgecko.arc-agi-2", "reasoning.arcAgi2"],
  ["benchgecko.bbh", "reasoning.bbh"],
  ["benchgecko.c-eval", "knowledge.cEval"],
  ["benchgecko.gpqa-diamond", "knowledge.gpqaDiamond"],
  ["benchgecko.hle", "knowledge.hle"],
  ["benchgecko.mmlu", "knowledge.mmlu"],
  ["benchgecko.mmmlu", "knowledge.mmmlu"],
  ["benchgecko.gsm8k", "math.gsm8k"],
  ["benchgecko.videomme", "multimodalGrounded.videoMme"],
  ["multilingual.swemultilingual", "coding.sweMultilingual"],
  ["multimodalgrounded.swemultimodal", "coding.sweMultimodal"],
  ["agentic.aaterminalbench21", "coding.terminalBench21"],
  ["agentic.apexagentsaa", "agentic.apexAgents"],
  ["agentic.mcpatlasclaimcoverage", "agentic.mcpAtlas"],
  ["agentic.toolathlonverifiedavgturns", "agentic.toolathlonVerified"],
  ["agentic.toolathlonverifiedpass3", "agentic.toolathlonVerified"],
  ["agentic.toolathlonverifiedpass3all", "agentic.toolathlonVerified"],
  ["coding.aascicode", "coding.sciCode"],
  ["instructionfollowing.aaifbench", "instructionFollowing.ifBench"],
  ["knowledge.aamlupro", "knowledge.mmluPro"],
  ["multimodalgrounded.aammmupro", "multimodalGrounded.mmmuPro"],
]);

const METRICS = new Map<string, string>([
  ["agentic.mcpatlasclaimcoverage", "claim_coverage"],
  ["agentic.toolathlonverifiedavgturns", "average_turns"],
  ["agentic.toolathlonverifiedpass3", "pass_at_3"],
  ["agentic.toolathlonverifiedpass3all", "pass_all_3"],
]);

export function canonicalBenchmarkId(rawId: string): string {
  return ALIASES.get(rawId.toLowerCase()) ?? rawId;
}

export function benchmarkKind(id: string): BenchmarkKind {
  const normalized = id.toLowerCase();
  if (normalized.startsWith("external.")) return "claim";
  if (normalized.startsWith("score.") || normalized === "benchgecko.avg_score" || normalized === "modelcap.model_cap") return "aggregate";
  if (normalized.includes("index") || normalized === "benchgecko.aa-quality-index") return "index";
  return "benchmark";
}

export function canonicalizeBenchmarkObservation(observation: BenchmarkObservation): BenchmarkObservation {
  const rawIds = observation.source_benchmark_ids ?? [observation.benchmark_id];
  const canonicalId = canonicalBenchmarkId(observation.benchmark_id);
  return {
    ...observation,
    benchmark_id: canonicalId,
    kind: observation.kind ?? benchmarkKind(canonicalId),
    source_benchmark_ids: [...new Set(rawIds)].sort(),
    ...(observation.metric ? { metric: observation.metric } : METRICS.get(observation.benchmark_id.toLowerCase()) ? { metric: METRICS.get(observation.benchmark_id.toLowerCase()) } : {}),
  };
}

export function canonicalizeBenchmarkDefinition(definition: BenchmarkDefinition): BenchmarkDefinition {
  const canonicalId = canonicalBenchmarkId(definition.id);
  return {
    ...definition,
    id: canonicalId,
    kind: definition.kind ?? benchmarkKind(canonicalId),
    aliases: [...new Set([...(definition.aliases ?? []), definition.id].filter((id) => id !== canonicalId))].sort(),
  };
}

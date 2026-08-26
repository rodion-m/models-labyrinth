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
  ["aaautomationbench", "agentic.automationBench"],
  ["agentic.aaautomationbench", "agentic.automationBench"],
  ["aabriefcaseelo", "agentic.briefcaseElo"],
  ["agentic.aabriefcaseelo", "agentic.briefcaseElo"],
  ["aaenterpriseopsgym", "agentic.enterpriseOpsGym"],
  ["agentic.aaenterpriseopsgym", "agentic.enterpriseOpsGym"],
  ["aaitbench", "agentic.itBench"],
  ["agentic.aaitbench", "agentic.itBench"],
  ["aatau3banking", "agentic.tau3Bench"],
  ["agentic.aatau3banking", "agentic.tau3Bench"],
  ["apexagents", "agentic.apexAgents"],
  ["apexagentsaa", "agentic.apexAgents"],
  ["automationbench", "agentic.automationBench"],
  ["bankertoolbench", "agentic.bankerToolBench"],
  ["briefcaseelo", "agentic.briefcaseElo"],
  ["ctirealm", "agentic.ctiRealm"],
  ["cybench", "agentic.cybench"],
  ["cybergym", "agentic.cyberGym"],
  ["enterpriseopsgym", "agentic.enterpriseOpsGym"],
  ["gdpvalrubrics", "agentic.gdpvalRubrics"],
  ["itbench", "agentic.itBench"],
  ["jobbench", "agentic.jobBench"],
  ["spreadsheetbench2", "agentic.spreadsheetBench2"],
  ["tau3bench", "agentic.tau3Bench"],
  ["agentic.apexagentsaa", "agentic.apexAgents"],
  ["agentic.mcpatlasclaimcoverage", "agentic.mcpAtlas"],
  ["agentic.toolathlonverifiedavgturns", "agentic.toolathlonVerified"],
  ["agentic.toolathlonverifiedpass3", "agentic.toolathlonVerified"],
  ["agentic.toolathlonverifiedpass3all", "agentic.toolathlonVerified"],
  ["coding.aascicode", "coding.sciCode"],
  ["instructionfollowing.aaifbench", "instructionFollowing.ifBench"],
  ["knowledge.aamlupro", "knowledge.mmluPro"],
  ["multimodalgrounded.aammmupro", "multimodalGrounded.mmmuPro"],
  ["sweverified", "coding.sweVerified"],
  ["sweverifiedarcee", "coding.sweVerified"],
  ["valsswebench", "coding.sweVerified"],
  ["vals.swebench", "coding.sweVerified"],
  ["terminalbench21", "coding.terminalBench21"],
  ["valsterminalbench21", "coding.terminalBench21"],
  ["aaterminalbench21", "coding.terminalBench21"],
  ["vals.terminal-bench-2-1", "coding.terminalBench21"],
  ["gpqadiamond", "knowledge.gpqaDiamond"],
  ["aagpqadiamond", "knowledge.gpqaDiamond"],
  ["valsgpqadiamond", "knowledge.gpqaDiamond"],
  ["vals.gpqa", "knowledge.gpqaDiamond"],
  ["mmlupro", "knowledge.mmluPro"],
  ["aamlupro", "knowledge.mmluPro"],
  ["valsmmlupro", "knowledge.mmluPro"],
  ["vals.mmlu_pro", "knowledge.mmluPro"],
  ["mmmu", "multimodalGrounded.mmmu"],
  ["valsmmmu", "multimodalGrounded.mmmu"],
  ["vals.mmmu", "multimodalGrounded.mmmu"],
  ["mmmupro", "multimodalGrounded.mmmuPro"],
  ["aammmupro", "multimodalGrounded.mmmuPro"],
  ["hmmt2025", "math.hmmtFeb2025"],
  ["hmmtfeb2025", "math.hmmtFeb2025"],
  ["gdpvalaa", "professional.gdpvalAa"],
  ["gdpvalaanormalized", "professional.gdpvalAa"],
  ["agentic.gdpvalaa", "professional.gdpvalAa"],
  ["agentic.gdpvalaanormalized", "professional.gdpvalAa"],
  ["healthbenchprofessional", "knowledge.healthBenchProfessional"],
  ["healthbenchprofessionalraw", "knowledge.healthBenchProfessional"],
  ["knowledge.healthbenchprofessionalraw", "knowledge.healthBenchProfessional"],
  ["officeqa", "multimodalGrounded.officeQa"],
  ["officeqapro", "multimodalGrounded.officeQaPro"],
  ["toolathlonverifiedpass3", "agentic.toolathlonVerified"],
  ["toolathlonverifiedpass3all", "agentic.toolathlonVerified"],
  ["toolathlonverified", "agentic.toolathlonVerified"],
  ["vals.aime", "valsAime"],
  ["vals.case_law_v2", "valsCaseLawV2"],
  ["vals.code-migration", "codeMigration"],
  ["vals.corp_fin_v2", "valsCorpFinV2"],
  ["vals.cyber", "cyber"],
  ["vals.emb", "emb"],
  ["vals.fabv2", "financeAgentV2"],
  ["vals.hlab", "hlab"],
  ["vals.ioi", "valsIoi"],
  ["vals.lcb", "valsLiveCodeBench"],
  ["vals.legal_bench", "valsLegalBench"],
  ["vals.legal_research", "legalResearchBench"],
  ["valsmath500", "math500"],
  ["vals.math500", "math500"],
  ["vals.medcode", "valsMedCode"],
  ["vals.medqa", "valsMedQa"],
  ["vals.medscribe", "valsMedScribe"],
  ["valsmgsm", "mgsm"],
  ["vals.mgsm", "mgsm"],
  ["vals.mortgage_tax", "valsMortgageTax"],
  ["vals.poker_agent", "pokerAgent"],
  ["vals.programbench", "programBench"],
  ["valsprogrambench", "programBench"],
  ["vals.proof_bench", "valsProofBench"],
  ["vals.public-benefits-bench", "publicBenefitsBench"],
  ["vals.public-benefits-bench-v1", "publicBenefitsBenchV1"],
  ["vals.reverse_eng", "valsReverseEngBench"],
  ["vals.sage", "sage"],
  ["vals.skillsbench", "skillsBench"],
  ["vals.tax_eval_v2", "taxEvalV2"],
  ["terminalbench2", "coding.terminalBench2"],
  ["valsterminalbench2", "coding.terminalBench2"],
  ["vals.terminal-bench-2", "coding.terminalBench2"],
  ["vals.time_horizon_index", "valsTimeHorizonKsp"],
  ["vals.vals_index", "valsIndex"],
  ["vals.vals_multimodal_index", "valsMultimodalIndex"],
  ["vals.vibe-code", "vibeCodeBench"],
  ["vals.web_search_backends", "valsWebSearchIndex"],
]);

const METRICS = new Map<string, string>([
  ["agentic.mcpatlasclaimcoverage", "claim_coverage"],
  ["agentic.toolathlonverifiedavgturns", "average_turns"],
  ["agentic.toolathlonverifiedpass3", "pass_at_3"],
  ["agentic.toolathlonverifiedpass3all", "pass_all_3"],
  ["gdpvalaanormalized", "normalized_score"],
  ["agentic.gdpvalaanormalized", "normalized_score"],
  ["healthbenchprofessionalraw", "raw_score"],
  ["knowledge.healthbenchprofessionalraw", "raw_score"],
  ["toolathlonverifiedpass3", "pass_at_3"],
  ["toolathlonverifiedpass3all", "pass_all_3"],
]);

const CANONICAL_NAMES = new Map<string, string>([
  ["agentic.automationbench", "AutomationBench"],
  ["agentic.briefcaseelo", "Briefcase"],
  ["agentic.enterpriseopsgym", "EnterpriseOps-Gym"],
  ["agentic.itbench", "ITBench"],
  ["agentic.tau3bench", "τ³-bench"],
  ["agentic.toolathlonverified", "Toolathlon Verified"],
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
  const inferredEvaluator = benchmarkEvaluator(observation.benchmark_id);
  const inferredVariant = observation.benchmark_id.toLowerCase().endsWith("aatau3banking") ? "banking" : undefined;
  return {
    ...observation,
    benchmark_id: canonicalId,
    kind: observation.kind ?? benchmarkKind(canonicalId),
    source_benchmark_ids: [...new Set(rawIds)].sort(),
    ...(observation.evaluator ? { evaluator: observation.evaluator } : inferredEvaluator ? { evaluator: inferredEvaluator } : {}),
    ...(observation.variant ? { variant: observation.variant } : inferredVariant ? { variant: inferredVariant } : {}),
    ...(observation.metric ? { metric: observation.metric } : METRICS.get(observation.benchmark_id.toLowerCase()) ? { metric: METRICS.get(observation.benchmark_id.toLowerCase()) } : {}),
  };
}

function benchmarkEvaluator(rawId: string): string | undefined {
  const normalized = rawId.toLowerCase();
  if (normalized.startsWith("benchgecko.hf-")) return "hugging_face";
  if (normalized.startsWith("benchgecko.helm-")) return "helm";
  if (normalized.startsWith("benchgecko.oc-")) return "opencompass";
  if (normalized.startsWith("aa") || normalized.split(".").some((part) => part.startsWith("aa"))
    || normalized.endsWith("apexagentsaa") || normalized.endsWith("gdpvalaa")
    || normalized.endsWith("gdpvalaanormalized")) return "artificial_analysis";
  return undefined;
}

export function canonicalizeBenchmarkDefinition(definition: BenchmarkDefinition): BenchmarkDefinition {
  const canonicalId = canonicalBenchmarkId(definition.id);
  const aliases = [...new Set([...(definition.aliases ?? []), definition.id])]
    .filter((id) => id !== canonicalId && canonicalBenchmarkId(id) === canonicalId)
    .sort();
  return {
    ...definition,
    id: canonicalId,
    ...(CANONICAL_NAMES.get(canonicalId.toLowerCase()) ? { name: CANONICAL_NAMES.get(canonicalId.toLowerCase()) } : {}),
    kind: definition.kind ?? benchmarkKind(canonicalId),
    aliases,
  };
}

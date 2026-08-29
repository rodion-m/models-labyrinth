import type { BenchmarkDefinition, BenchmarkObservation, SourceRecord, SourceResult } from "../types.js";
import { fetchText } from "../http.js";
import { alias, unresolvedModelId } from "../identity.js";
import { evidence, numeric, stringValue } from "../source-utils.js";
import { baseRecord, newRecordMap } from "./common.js";
import { parseCsv } from "./livebench.js";

export const PARSEBENCH_CSV_URL = "https://raw.githubusercontent.com/run-llama/ParseBench/main/leaderboard.csv";
export const PARSEBENCH_PAGE_URL = "https://github.com/run-llama/ParseBench";
export const EXTRACTBENCH_CSV_URL = "https://raw.githubusercontent.com/run-llama/ExtractBench/main/leaderboard.csv";
export const EXTRACTBENCH_PAGE_URL = "https://github.com/run-llama/ExtractBench";

const PARSEBENCH_REQUIRED_HEADERS = ["Provider", "Category", "Overall", "Tables", "Charts", "Content_Faithfulness", "Semantic_Formatting", "Visual_Grounding"];
const EXTRACTBENCH_REQUIRED_HEADERS = ["Provider", "Category", "Overall", "Short", "Medium", "Long"];

const PARSE_DIMENSIONS = [
  { column: "Tables", variant: "tables", pages: 503, documents: 284 },
  { column: "Charts", variant: "charts", pages: 568, documents: 99 },
  { column: "Content_Faithfulness", variant: "content_faithfulness", pages: 506, documents: 506 },
  { column: "Semantic_Formatting", variant: "semantic_formatting", pages: 476, documents: 476 },
  { column: "Visual_Grounding", variant: "visual_grounding", pages: 500, documents: 321 },
] as const;

const EXTRACT_SPLITS = [
  { column: "Short", variant: "short", documents: 252, pages: 615 },
  { column: "Medium", variant: "medium", documents: 98, pages: 2_438 },
  { column: "Long", variant: "long", documents: 20, pages: 1_816 },
] as const;

interface ParsedDocumentBenchmarkCsv {
  headers: string[];
  rows: Array<Record<string, string>>;
}

interface DocumentBenchmarkOptions {
  fetchImpl?: typeof fetch;
}

export function parseParseBenchCsv(text: string): ParsedDocumentBenchmarkCsv {
  return parseDocumentBenchmarkCsv(text, "ParseBench", PARSEBENCH_REQUIRED_HEADERS);
}

export function parseExtractBenchCsv(text: string): ParsedDocumentBenchmarkCsv {
  return parseDocumentBenchmarkCsv(text, "ExtractBench", EXTRACTBENCH_REQUIRED_HEADERS);
}

export async function collectParseBench(options: DocumentBenchmarkOptions = {}): Promise<SourceResult> {
  const fetchedAt = new Date().toISOString();
  const text = await fetchText(PARSEBENCH_CSV_URL, { fetchImpl: options.fetchImpl, timeoutMs: 30_000, maxBytes: 256 * 1024 });
  const parsed = parseParseBenchCsv(text);
  return collectDocumentRows({
    sourceId: "parsebench",
    pageUrl: PARSEBENCH_PAGE_URL,
    csvUrl: PARSEBENCH_CSV_URL,
    parsed,
    fetchedAt,
    buildRecord: (row) => parseBenchRecord(row, fetchedAt),
    definition: parseBenchDefinition(fetchedAt),
  });
}

export async function collectExtractBench(options: DocumentBenchmarkOptions = {}): Promise<SourceResult> {
  const fetchedAt = new Date().toISOString();
  const text = await fetchText(EXTRACTBENCH_CSV_URL, { fetchImpl: options.fetchImpl, timeoutMs: 30_000, maxBytes: 256 * 1024 });
  const parsed = parseExtractBenchCsv(text);
  return collectDocumentRows({
    sourceId: "extractbench",
    pageUrl: EXTRACTBENCH_PAGE_URL,
    csvUrl: EXTRACTBENCH_CSV_URL,
    parsed,
    fetchedAt,
    buildRecord: (row) => extractBenchRecord(row, fetchedAt),
    definition: extractBenchDefinition(fetchedAt),
  });
}

function parseDocumentBenchmarkCsv(text: string, name: string, requiredHeaders: string[]): ParsedDocumentBenchmarkCsv {
  const parsed = parseCsv(text);
  const rawHeaders = parsed.headers;
  const headers = rawHeaders.map((header) => header.trim());
  const missing = requiredHeaders.filter((header) => !headers.includes(header));
  if (missing.length > 0) throw new Error(`${name} CSV changed its required columns: missing ${missing.join(", ")}`);
  return {
    headers,
    rows: parsed.rows.map((row) => Object.fromEntries(rawHeaders.map((rawHeader, index) => [headers[index], row[rawHeader] ?? ""]))),
  };
}

function collectDocumentRows(input: {
  sourceId: string;
  pageUrl: string;
  csvUrl: string;
  parsed: ParsedDocumentBenchmarkCsv;
  fetchedAt: string;
  buildRecord: (row: Record<string, string>) => SourceRecord | undefined;
  definition: BenchmarkDefinition;
}): SourceResult {
  if (input.parsed.rows.length === 0) throw new Error(`${input.sourceId} CSV returned no rows`);
  const records: SourceRecord[] = [];
  let skippedRows = 0;
  for (const row of input.parsed.rows) {
    const record = input.buildRecord(row);
    if (record) records.push(record);
    else skippedRows += 1;
  }
  if (records.length === 0) throw new Error(`${input.sourceId} CSV returned no valid leaderboard rows`);
  return {
    source_id: input.sourceId,
    url: input.pageUrl,
    fetched_at: input.fetchedAt,
    status: "ok",
    records: [...newRecordMap(records).values()],
    benchmark_definitions: [input.definition],
    ...(skippedRows > 0 ? { warnings: [`${input.sourceId} skipped ${skippedRows} malformed leaderboard rows`] } : {}),
    replace_previous: true,
  };
}

function parseBenchRecord(row: Record<string, string>, fetchedAt: string): SourceRecord | undefined {
  const provider = stringValue(row.Provider);
  const category = stringValue(row.Category);
  const overall = numeric(row.Overall);
  if (!provider || !category || overall === undefined) return undefined;

  const sourceEvidence = evidence(
    "parsebench",
    PARSEBENCH_CSV_URL,
    fetchedAt,
    ["benchmark", "cost", "evaluation_configuration"],
    [],
    "Published ParseBench leaderboard row. Evaluation systems are not provider-route availability claims.",
  );
  const normalized = documentEvaluationRecord("parsebench", row.HF_Model_ID, provider, category, fetchedAt, PARSEBENCH_CSV_URL);
  const observations: BenchmarkObservation[] = [{
    benchmark_id: "document.parseBench",
    value: overall,
    metric: "overall_score",
    unit: "percent",
    ...(inferEffort(provider) ? { effort: inferEffort(provider) } : {}),
    evaluator: "parsebench",
    dataset_version: "main",
    sample_count: 1_211,
    metrics: parseCostMetrics(row),
    configuration: evaluationConfiguration(provider, category, row.HF_Model_ID),
    evidence: sourceEvidence,
  }];
  for (const dimension of PARSE_DIMENSIONS) {
    const value = numeric(row[dimension.column]);
    if (value === undefined) continue;
    observations.push({
      benchmark_id: "document.parseBench",
      value,
      metric: "dimension_score",
      unit: "percent",
      variant: dimension.variant,
      ...(inferEffort(provider) ? { effort: inferEffort(provider) } : {}),
      evaluator: "parsebench",
      dataset_version: "main",
      sample_count: dimension.documents,
      metrics: { pages: dimension.pages, documents: dimension.documents },
      configuration: evaluationConfiguration(provider, category, row.HF_Model_ID),
      evidence: sourceEvidence,
    });
  }
  normalized.benchmarks = observations;
  normalized.evidence = [sourceEvidence];
  return normalized;
}

function extractBenchRecord(row: Record<string, string>, fetchedAt: string): SourceRecord | undefined {
  const provider = stringValue(row.Provider);
  const category = stringValue(row.Category);
  const overall = numeric(row.Overall);
  if (!provider || !category || overall === undefined) return undefined;

  const sourceEvidence = evidence(
    "extractbench",
    EXTRACTBENCH_CSV_URL,
    fetchedAt,
    ["benchmark", "cost", "runtime", "evaluation_configuration"],
    [],
    "Published ExtractBench leaderboard row. Evaluation systems are not provider-route availability claims.",
  );
  const normalized = documentEvaluationRecord("extractbench", undefined, provider, category, fetchedAt, EXTRACTBENCH_CSV_URL);
  const observations: BenchmarkObservation[] = [{
    benchmark_id: "document.extractBench",
    value: overall,
    metric: "unified_value_f1",
    unit: "percent",
    evaluator: "extractbench",
    dataset_version: "main",
    sample_count: 370,
    metrics: extractOverallMetrics(row),
    configuration: evaluationConfiguration(provider, category),
    evidence: sourceEvidence,
  }];
  for (const split of EXTRACT_SPLITS) {
    const value = numeric(row[split.column]);
    if (value === undefined) continue;
    observations.push({
      benchmark_id: "document.extractBench",
      value,
      metric: "unified_value_f1",
      unit: "percent",
      variant: split.variant,
      evaluator: "extractbench",
      dataset_version: "main",
      sample_count: split.documents,
      metrics: compactExtractMetrics(row, split.variant, split.pages),
      configuration: evaluationConfiguration(provider, category),
      evidence: sourceEvidence,
    });
  }
  normalized.benchmarks = observations;
  normalized.evidence = [sourceEvidence];
  return normalized;
}

function documentEvaluationRecord(
  sourceId: "parsebench" | "extractbench",
  hfModelId: unknown,
  provider: string,
  category: string,
  fetchedAt: string,
  url: string,
): SourceRecord {
  const sourceModelId = stringValue(hfModelId);
  const evaluationKey = `${provider}\u0000${category}`;
  const normalized = baseRecord({
    sourceId,
    rawId: sourceModelId ?? evaluationKey,
    publisher: sourceModelId?.includes("/") ? sourceModelId.split("/")[0] : undefined,
    name: sourceModelId?.split("/").at(-1) ?? provider,
    fetchedAt,
    url,
    evidenceFields: ["benchmark", "evaluation_configuration"],
  });
  normalized.aliases = [
    ...(normalized.aliases ?? []),
    alias(provider, sourceId, "evaluation_system"),
    alias(`${provider}::${category}`, sourceId, "evaluation_system_category"),
  ];
  if (!sourceModelId) {
    normalized.id = unresolvedModelId(sourceId, evaluationKey);
    normalized.identity_confidence = "unresolved";
    normalized.aliases = [alias(provider, sourceId, "evaluation_system"), alias(normalized.id, sourceId, "canonical_id")];
  }
  return normalized;
}

function evaluationConfiguration(provider: string, category: string, hfModelId?: unknown): Record<string, string> {
  return {
    evaluation_system: provider,
    category,
    ...(stringValue(hfModelId) ? { hf_model_id: stringValue(hfModelId)! } : {}),
  };
}

function parseCostMetrics(row: Record<string, string>): Record<string, number> {
  const metrics: Record<string, number> = {};
  addCentsPerPage(metrics, "evaluation_cost_usd_per_page", row.Cost_Per_Page);
  addCentsPerPage(metrics, "cost_charts_usd_per_page", row.Cost_Charts);
  addCentsPerPage(metrics, "cost_tables_usd_per_page", row.Cost_Tables);
  addCentsPerPage(metrics, "cost_text_usd_per_page", row.Cost_Text);
  addCentsPerPage(metrics, "cost_layout_usd_per_page", row.Cost_Layout);
  return metrics;
}

function compactExtractMetrics(row: Record<string, string>, variant: string, pages: number): Record<string, number> {
  const suffix = variant[0].toUpperCase() + variant.slice(1);
  const metrics: Record<string, number> = { pages };
  addMetric(metrics, "precision", row[`P_${suffix}`]);
  addMetric(metrics, "recall", row[`R_${suffix}`]);
  addMetric(metrics, "word_grounding_f1", row[`Word_Grounding_${suffix}`]);
  addMetric(metrics, "page_grounding_f1", row[`Page_Grounding_${suffix}`]);
  addMetric(metrics, "latency_seconds_per_document", row[`Latency_S_Per_Doc_${suffix}`]);
  addMetric(metrics, "evaluation_cost_usd_per_page", row[`Cost_${suffix}`]);
  return metrics;
}

function extractOverallMetrics(row: Record<string, string>): Record<string, number> {
  const metrics: Record<string, number> = {};
  addMetric(metrics, "evaluation_cost_usd_per_page", row.Cost_Per_Page);
  addMetric(metrics, "word_grounding_f1", row.Word_Grounding);
  addMetric(metrics, "page_grounding_f1", row.Page_Grounding);
  return metrics;
}

function addMetric(target: Record<string, number>, key: string, raw: unknown): void {
  const value = numeric(raw);
  if (value !== undefined) target[key] = value;
}

function addCentsPerPage(target: Record<string, number>, key: string, raw: unknown): void {
  const value = numeric(raw);
  if (value !== undefined) target[key] = value / 100;
}

function inferEffort(value: string): string | undefined {
  const normalized = value.toLowerCase();
  if (/disable\s+thinking|reasoning\s+none|\bno\s+thinking\b/.test(normalized)) return "none";
  const match = normalized.match(/\b(minimal|low|medium|high|xhigh|max)(?:[- ]effort)?\b/);
  return match?.[1];
}

function parseBenchDefinition(fetchedAt: string): BenchmarkDefinition {
  return {
    id: "document.parseBench",
    kind: "benchmark",
    name: "ParseBench",
    category: "document_parsing",
    description: "Deterministic PDF parsing evaluation for agent-ready structured output across tables, charts, content faithfulness, semantic formatting, and visual grounding; 2,078 pages from 1,211 enterprise documents.",
    version: "main",
    dataset_type: "public",
    url: PARSEBENCH_PAGE_URL,
    evidence: evidence("parsebench", PARSEBENCH_CSV_URL, fetchedAt, ["benchmark_definition"]),
  };
}

function extractBenchDefinition(fetchedAt: string): BenchmarkDefinition {
  return {
    id: "document.extractBench",
    kind: "benchmark",
    name: "ExtractBench",
    category: "document_extraction",
    description: "Schema-guided enterprise document extraction scored for unified value F1 and evidence grounding across short, medium, and long documents; 370 documents, 4,869 pages, 8 business domains, and 67 document types.",
    version: "main",
    dataset_type: "public",
    url: EXTRACTBENCH_PAGE_URL,
    evidence: evidence("extractbench", EXTRACTBENCH_CSV_URL, fetchedAt, ["benchmark_definition"]),
  };
}

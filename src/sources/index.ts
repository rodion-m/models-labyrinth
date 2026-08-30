import type { Snapshot, SourceResult } from "../types.js";
import { collectArtificialAnalysis } from "./artificial-analysis.js";
import { collectBenchLM } from "./benchlm.js";
import { collectModelsDev } from "./models-dev.js";
import { collectOpenRouter } from "./openrouter.js";
import { collectBenchGecko, collectCloudPrice, collectEpoch, collectModelCap, collectPortkey } from "./enrichment.js";
import { collectVals } from "./vals.js";
import { collectLiveBench } from "./livebench.js";
import { collectOpenAsrEnglishLongform, collectOpenAsrEnglishShortform, collectOpenAsrMultilingual } from "./open-asr.js";
import { collectArtificialAnalysisSpeechToText, collectPipecatStt } from "./speech.js";
import { collectExtractBench, collectParseBench } from "./document-benchmarks.js";
import { ARENA_DATASET_URL, collectArena, collectForecastBench, FORECASTBENCH_PAGE_URL } from "./model-benchmarks.js";

export interface SourceAdapter {
  source_id: string;
  url: string;
  collect(options: { fetchImpl?: typeof fetch; previous?: Snapshot }): Promise<SourceResult>;
}

export const SOURCE_ADAPTERS: SourceAdapter[] = [
  { source_id: "openrouter", url: "https://openrouter.ai/api/v1/models", collect: collectOpenRouter },
  { source_id: "models_dev", url: "https://models.dev/catalog.json", collect: collectModelsDev },
  { source_id: "benchlm", url: "https://www.benchlm.ai/data/models.json", collect: collectBenchLM },
  { source_id: "artificial_analysis", url: "https://artificialanalysis.ai/api/v2/language/models/free", collect: collectArtificialAnalysis },
  { source_id: "artificial_analysis_stt", url: "https://artificialanalysis.ai/api/v2/media/speech-to-text/models/free", collect: collectArtificialAnalysisSpeechToText },
  { source_id: "epoch", url: "https://epoch.ai/data/notable_ai_models.csv", collect: collectEpoch },
  { source_id: "portkey", url: "https://configs.portkey.ai/pricing/", collect: collectPortkey },
  { source_id: "benchgecko", url: "https://benchgecko.ai/api/v1/models", collect: collectBenchGecko },
  { source_id: "modelcap", url: "https://modelcap.ai/data/models.json", collect: collectModelCap },
  { source_id: "cloudprice", url: "https://ai.cloudprice.net/api/v1/models", collect: collectCloudPrice },
  { source_id: "vals", url: "https://www.vals.ai/benchmarks", collect: collectVals },
  { source_id: "livebench", url: "https://github.com/LiveBench/new-livebench/tree/main/public", collect: collectLiveBench },
  { source_id: "pipecat_stt", url: "https://github.com/pipecat-ai/stt-benchmark", collect: collectPipecatStt },
  { source_id: "open_asr_multilingual", url: "https://raw.githubusercontent.com/huggingface/open_asr_leaderboard/main/scripts/data/multilingual.csv", collect: collectOpenAsrMultilingual },
  { source_id: "open_asr_en_shortform", url: "https://raw.githubusercontent.com/huggingface/open_asr_leaderboard/main/scripts/data/en_shortform.csv", collect: collectOpenAsrEnglishShortform },
  { source_id: "open_asr_en_longform", url: "https://raw.githubusercontent.com/huggingface/open_asr_leaderboard/main/scripts/data/en_longform.csv", collect: collectOpenAsrEnglishLongform },
  { source_id: "parsebench", url: "https://github.com/run-llama/ParseBench", collect: collectParseBench },
  { source_id: "extractbench", url: "https://github.com/run-llama/ExtractBench", collect: collectExtractBench },
  { source_id: "arena", url: ARENA_DATASET_URL, collect: collectArena },
  { source_id: "forecastbench", url: FORECASTBENCH_PAGE_URL, collect: collectForecastBench },
];

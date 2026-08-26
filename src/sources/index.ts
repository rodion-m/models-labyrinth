import type { Snapshot, SourceResult } from "../types.js";
import { collectArtificialAnalysis } from "./artificial-analysis.js";
import { collectBenchLM } from "./benchlm.js";
import { collectModelsDev } from "./models-dev.js";
import { collectOpenRouter } from "./openrouter.js";
import { collectBenchGecko, collectCloudPrice, collectEpoch, collectModelCap, collectPortkey } from "./enrichment.js";

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
  { source_id: "epoch", url: "https://epoch.ai/data/notable_ai_models.csv", collect: collectEpoch },
  { source_id: "portkey", url: "https://configs.portkey.ai/pricing/", collect: collectPortkey },
  { source_id: "benchgecko", url: "https://benchgecko.ai/api/v1/models", collect: collectBenchGecko },
  { source_id: "modelcap", url: "https://modelcap.ai/data/models.json", collect: collectModelCap },
  { source_id: "cloudprice", url: "https://ai.cloudprice.net/api/v1/models", collect: collectCloudPrice },
];

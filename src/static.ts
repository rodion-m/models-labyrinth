import { promises as fs } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { MODELS_DB_SCHEMA } from "./schema.js";
import { health, listBenchmarks, listOffers, listProviders, listProfiles } from "./query.js";
import type { Snapshot } from "./types.js";
import { stableValue } from "./hash.js";

export async function buildStatic(snapshot: Snapshot, outputRoot = resolve(process.cwd(), "public")): Promise<void> {
  const apiRoot = join(outputRoot, "api", "v1");
  await fs.rm(apiRoot, { recursive: true, force: true });
  await fs.mkdir(join(apiRoot, "models"), { recursive: true });
  await writeJson(join(apiRoot, "snapshot.json"), snapshot);
  await writeJson(join(apiRoot, "schema.json"), MODELS_DB_SCHEMA);
  await writeJson(join(apiRoot, "health.json"), health(snapshot));
  await writeJson(join(apiRoot, "providers.json"), { data: listProviders(snapshot) });
  await writeJson(join(apiRoot, "benchmarks.json"), { data: listBenchmarks(snapshot) });
  await writeJson(join(apiRoot, "profiles.json"), { data: listProfiles() });
  await writeJson(join(apiRoot, "offers.json"), listOffers(snapshot, new URLSearchParams("limit=100")));
  const index = snapshot.models.map((model) => ({ id: model.id, name: model.name, file: `models/${fileKey(model.id)}.json` }));
  await writeJson(join(apiRoot, "models.json"), { data: index, meta: { total: index.length, updated_at: snapshot.generated_at, schema_version: snapshot.schema_version } });
  await writeJson(join(apiRoot, "models", "index.json"), { data: index });
  await writeModelFiles(snapshot, join(apiRoot, "models"));
}

export function fileKey(id: string): string {
  return Buffer.from(id, "utf8").toString("base64url");
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true });
  await fs.writeFile(path, `${JSON.stringify(stableValue(value), null, 2)}\n`, "utf8");
}

async function writeModelFiles(snapshot: Snapshot, outputDirectory: string): Promise<void> {
  let next = 0;
  const worker = async (): Promise<void> => {
    while (true) {
      const index = next++;
      if (index >= snapshot.models.length) return;
      const model = snapshot.models[index];
      await writeJson(join(outputDirectory, `${fileKey(model.id)}.json`), model);
    }
  };
  const workerCount = Math.min(32, Math.max(1, snapshot.models.length));
  await Promise.all(Array.from({ length: workerCount }, worker));
}

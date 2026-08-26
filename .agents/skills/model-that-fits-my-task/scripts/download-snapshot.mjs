#!/usr/bin/env node

import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const DEFAULT_BASE = "https://rodion-m.github.io/models-labyrinth/api/v1";
const MANIFEST_FILE = "bundle.json";

export function parseArgs(argv) {
  const options = { base: DEFAULT_BASE, out: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--help" || value === "-h") return { help: true };
    if (value !== "--base" && value !== "--out") throw new Error(`unknown argument: ${value}`);
    const next = argv[index + 1];
    if (!next) throw new Error(`${value} requires a value`);
    if (value === "--base") options.base = next.replace(/\/$/, "");
    else options.out = next;
    index += 1;
  }
  if (!options.out) throw new Error("--out is required");
  return options;
}

export function validateBundle(health, schema, snapshot) {
  validateHealth(health);
  if (!schema || typeof schema !== "object" || !schema.$defs) throw new Error("schema is not a Models Labyrinth JSON Schema");
  if (!snapshot || typeof snapshot !== "object") throw new Error("snapshot is not an object");
  if (!Array.isArray(snapshot.models) || !Array.isArray(snapshot.sources) || !Array.isArray(snapshot.benchmarks)) {
    throw new Error("snapshot root collections are missing");
  }
  if (snapshot.schema_version !== health.schema_version) throw new Error("health and snapshot schema versions differ");
  if (health.content_hash !== snapshot.content_hash) throw new Error("health and snapshot content hashes differ");
  if (schema.properties?.schema_version?.const !== snapshot.schema_version) throw new Error("schema and snapshot versions differ");
  if (health.model_count !== snapshot.models.length) throw new Error("health and snapshot model counts differ");
  if (health.source_count !== snapshot.sources.length) throw new Error("health and snapshot source counts differ");
  return {
    generated_at: snapshot.generated_at,
    schema_version: snapshot.schema_version,
    content_hash: snapshot.content_hash,
    model_count: snapshot.models.length,
    source_count: snapshot.sources.length,
  };
}

function validateHealth(health) {
  if (!health || health.status !== "ok") throw new Error("catalog health is not ok");
  if (!health.content_hash || !health.schema_version) throw new Error("catalog health identity is incomplete");
}

async function fetchJson(url, fetchImpl = fetch, timeoutMs = 120_000) {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  const text = await response.text();
  try {
    return { value: JSON.parse(text), text };
  } catch {
    throw new Error(`${url} did not return valid JSON`);
  }
}

async function writeAtomic(path, contents) {
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, contents, "utf8");
  try {
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function reusableBundle(outputDirectory, health) {
  try {
    const manifest = JSON.parse(await readFile(resolve(outputDirectory, MANIFEST_FILE), "utf8"));
    if (manifest.content_hash !== health.content_hash || manifest.schema_version !== health.schema_version) return undefined;
    await Promise.all([
      access(resolve(outputDirectory, "schema.json")),
      access(resolve(outputDirectory, "snapshot.json")),
    ]);
    return manifest;
  } catch {
    return undefined;
  }
}

export async function download({ base, out, fetchImpl = fetch }) {
  const outputDirectory = resolve(out);
  const healthResult = await fetchJson(`${base}/health.json`, fetchImpl);
  validateHealth(healthResult.value);
  const cached = await reusableBundle(outputDirectory, healthResult.value);
  if (cached) return { ...cached, reused: true, output_directory: outputDirectory };

  const [schemaResult, snapshotResult] = await Promise.all([
    fetchJson(`${base}/schema.json`, fetchImpl),
    fetchJson(`${base}/snapshot.json`, fetchImpl),
  ]);
  const summary = validateBundle(healthResult.value, schemaResult.value, snapshotResult.value);
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeAtomic(resolve(outputDirectory, "schema.json"), `${schemaResult.text.trimEnd()}\n`),
    writeAtomic(resolve(outputDirectory, "snapshot.json"), `${snapshotResult.text.trimEnd()}\n`),
  ]);
  await writeAtomic(resolve(outputDirectory, MANIFEST_FILE), `${JSON.stringify(summary, null, 2)}\n`);
  return { ...summary, reused: false, output_directory: outputDirectory };
}

function usage() {
  return "Usage: node scripts/download-snapshot.mjs --out <directory> [--base <api-base>]";
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) console.log(usage());
    else console.log(JSON.stringify(await download(options), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(usage());
    process.exitCode = 1;
  }
}

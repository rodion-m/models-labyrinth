import { resolve } from "node:path";
import { refreshDatabase } from "../src/refresh.ts";

const path = resolve(process.cwd(), "models_db.json");
const result = await refreshDatabase({ path });
for (const source of result.results) {
  const extra = source.error ? ` error=${source.error}` : source.warnings?.length ? ` warnings=${source.warnings.length}` : "";
  console.log(`${source.source_id}: ${source.status} records=${source.records.length}${extra}`);
}
console.log(`models=${result.snapshot.models.length} hash=${result.snapshot.content_hash} changed=${result.changed}`);

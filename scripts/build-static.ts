import { resolve } from "node:path";
import { copyFile } from "node:fs/promises";
import { loadSnapshot } from "../src/db.js";
import { buildStatic } from "../src/static.js";

const projectRoot = process.cwd();
const outputRoot = resolve(projectRoot, "public");
const snapshotPath = resolve(projectRoot, "models_db.json");

await buildStatic(loadSnapshot({ path: snapshotPath }), outputRoot);
await copyFile(resolve(projectRoot, "site", "index.html"), resolve(outputRoot, "index.html"));
await copyFile(resolve(projectRoot, "site", "labyrinth-hero.jpg"), resolve(outputRoot, "labyrinth-hero.jpg"));
console.log("static API projection written to public/");

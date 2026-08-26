import { resolve } from "node:path";
import { loadSnapshot } from "../src/db.ts";
import { buildStatic } from "../src/static.ts";

await buildStatic(loadSnapshot(), resolve(process.cwd(), "public"));
console.log("static API projection written to public/");

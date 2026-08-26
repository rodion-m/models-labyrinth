import { resolve } from "node:path";
import { loadSnapshot } from "../src/db.js";
import { buildStatic } from "../src/static.js";

await buildStatic(loadSnapshot(), resolve(process.cwd(), "public"));
console.log("static API projection written to public/");

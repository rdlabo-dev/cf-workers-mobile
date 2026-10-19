import { fileURLToPath } from "node:url";
import { checkout } from "../checkout.mjs";
const { run, clean } = await checkout(import.meta.url);
run("npm", ["ci", "--no-audit", "--no-fund"]);
run("npm", ["run", "build"]);
// The cf CLI does not expose the legacy Pages Functions compiler.
run(
  fileURLToPath(
    new URL("../../../node_modules/.bin/wrangler", import.meta.url),
  ),
  ["pages", "functions", "build", "functions", "--outdir=../worker"],
);
clean();

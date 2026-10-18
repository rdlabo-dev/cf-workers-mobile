import { build } from "esbuild";
import { writeFile } from "node:fs/promises";
const result = await build({
  entryPoints: ["src/browser/documents/page.ts"],
  bundle: true,
  format: "iife",
  target: "es2022",
  write: false,
});
await writeFile(
  "dist/browser/documents/page-source.js",
  `export const pageScript = ${JSON.stringify(result.outputFiles[0].text)};\n`,
);

await writeFile(
  "dist/browser/documents/service-worker.js",
  await (
    await import("node:fs/promises")
  ).readFile("src/browser/documents/service-worker.js"),
);

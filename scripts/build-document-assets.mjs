import { build } from "esbuild";
import { writeFile } from "node:fs/promises";
const result = await build({
  entryPoints: ["src/runtime/documents/page.ts"],
  bundle: true,
  format: "iife",
  target: "es2022",
  write: false,
});
await writeFile(
  "dist/runtime/documents/page-source.js",
  `export const pageScript = ${JSON.stringify(result.outputFiles[0].text)};\n`,
);

await writeFile(
  "dist/runtime/documents/service-worker.js",
  await (
    await import("node:fs/promises")
  ).readFile("src/runtime/documents/service-worker.js"),
);

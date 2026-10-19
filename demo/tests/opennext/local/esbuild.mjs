import { build } from "esbuild";
import { workersCapacitorPlugin } from "workers-capacitor/tooling/esbuild";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";
const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const outdir = here("../../../artifacts/opennext-esbuild");
await build({
  entryPoints: [here("main.ts")],
  outdir,
  bundle: true,
  format: "esm",
  splitting: true,
  target: "es2022",
  platform: "browser",
  define: { "import.meta.env.VITE_REPORT_ORIGIN": "undefined" },
  plugins: [
    workersCapacitorPlugin({
      execution: "local",
      worker: here("../../../opennext/.open-next/worker.js"),
      workerConfig: here("wrangler.json"),
    }),
  ],
});
await writeFile(
  outdir + "/index.html",
  '<!doctype html><script type="module" src="/main.js"></script>',
);

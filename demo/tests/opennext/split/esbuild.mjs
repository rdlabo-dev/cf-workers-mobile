import { build } from "esbuild";
import { workersCapacitorPlugin } from "cf-workers-mobile/tooling/esbuild";
import { fileURLToPath } from "node:url";
import { cp, mkdir, writeFile, rm } from "node:fs/promises";
const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const outdir = here("../../../artifacts/opennext-split-esbuild/www");
await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });
await cp(here("../../../opennext/.open-next/assets"), outdir, {
  recursive: true,
});
await build({
  entryPoints: [here("main.ts")],
  outdir,
  bundle: true,
  splitting: true,
  platform: "browser",
  format: "esm",
  target: "es2022",
  sourcemap: true,
  define: {
    "import.meta.env.VITE_WORKER_ORIGIN": "undefined",
    "import.meta.env.VITE_TEST_DEVICE_TOKEN": "undefined",
  },
  plugins: [
    workersCapacitorPlugin({
      worker: here("../../../opennext/.open-next/worker.js"),
      workerConfig: here("../../../opennext/wrangler.jsonc"),
      assetsExecution: "remote",
      execution: [
        { method: "GET", path: "/" },
        { method: "GET", path: "/api/message" },
        { method: "GET", path: "/account" },
      ],
    }),
  ],
});
await writeFile(
  outdir + "/index.html",
  '<script type="module" src="/main.js"></script>',
);

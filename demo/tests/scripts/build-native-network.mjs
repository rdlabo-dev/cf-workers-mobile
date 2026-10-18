import { capacitorWorkersPlugin } from "../../../dist/esbuild.js";
import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const output = new URL("../../artifacts/native-network/", import.meta.url);
await mkdir(output, { recursive: true });
await build({
  entryPoints: ["main", "worker"].map((name) =>
    fileURLToPath(new URL(`../native/network/${name}.ts`, import.meta.url)),
  ),
  outdir: fileURLToPath(output),
  bundle: true,
  define: {
    __NETWORK_TLS__: process.env.NETWORK_TLS === "1" ? "true" : "false",
  },
  plugins: [
    capacitorWorkersPlugin({
      worker: fileURLToPath(
        new URL("../../src/workers/hono/standard.ts", import.meta.url),
      ),
    }),
  ],
  loader: { ".wasm": "binary" },
  format: "esm",
  target: "es2022",
});
await writeFile(
  new URL("index.html", output),
  '<!doctype html><meta charset="utf-8"><title>Native network contract</title><body><pre>Running native network contract</pre><script type="module" src="./main.js"></script>',
);

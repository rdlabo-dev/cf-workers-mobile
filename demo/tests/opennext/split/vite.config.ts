import { defineConfig } from "vite";
import { workersCapacitorPlugin } from "cf-workers-mobile/tooling/vite";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const app = process.env.OPENNEXT_APP_ROOT ?? here("../../../opennext");
export default defineConfig({
  root: here("."),
  publicDir: resolve(app, ".open-next/assets"),
  plugins: [
    workersCapacitorPlugin({
      execution: [
        { method: "GET", path: "/" },
        { method: "GET", path: "/api/message" },
        { method: "GET", path: "/account" },
      ],
      worker: resolve(app, ".open-next/worker.js"),
      workerConfig: resolve(app, "wrangler.jsonc"),
      assetsExecution: "remote",
    }),
  ],
  build: {
    outDir: here("../../../artifacts/opennext-split/www"),
    emptyOutDir: true,
    target: "es2022",
    sourcemap: true,
  },
});

import { defineConfig } from "vite";
import { workersCapacitorPlugin } from "workers-capacitor/tooling/vite";
import { fileURLToPath } from "node:url";
const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
export default defineConfig({
  root: here("."),
  publicDir: here("../../../opennext/.open-next/assets"),
  plugins: [
    workersCapacitorPlugin({
      execution: [
        { method: "GET", path: "/" },
        { method: "GET", path: "/api/message" },
        { method: "GET", path: "/account" },
      ],
      worker: here("../../../opennext/.open-next/worker.js"),
      workerConfig: here("../../../opennext/wrangler.jsonc"),
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

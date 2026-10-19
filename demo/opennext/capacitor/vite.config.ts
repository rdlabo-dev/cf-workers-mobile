import { defineConfig } from "vite";
import { workersCapacitorPlugin } from "workers-capacitor/tooling/vite";
import { fileURLToPath } from "node:url";
const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
export default defineConfig({
  root: here("."),
  // Bundle browser assets; pages, middleware and D1 still execute on the Worker.
  publicDir: here("../.open-next/assets"),
  plugins: [
    workersCapacitorPlugin({
      worker: here("../.open-next/worker.js"),
      assetsExecution: "remote",
    }),
  ],
  build: { outDir: here("../www"), emptyOutDir: true, target: "es2022" },
});

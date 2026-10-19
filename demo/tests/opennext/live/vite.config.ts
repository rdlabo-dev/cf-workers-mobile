import { defineConfig } from "vite";
import { workersCapacitorPlugin } from "workers-capacitor/tooling/vite";
import { fileURLToPath } from "node:url";
const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
export default defineConfig({
  root: here("."),
  plugins: [
    workersCapacitorPlugin({
      execution: "network",
      worker: here("../../../opennext/.open-next/worker.js"),
      assetsExecution: "remote",
    }),
  ],
  build: {
    outDir: here("../../../opennext/www"),
    emptyOutDir: true,
    target: "es2022",
  },
});

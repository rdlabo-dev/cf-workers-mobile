import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { workersCapacitorPlugin } from "cf-workers-native/tooling/vite";
export default defineConfig({
  root: fileURLToPath(new URL("./src", import.meta.url)),
  plugins: [
    workersCapacitorPlugin({
      execution: "local",
      worker: "./workers/hono/standard.ts",
      // To use Express, replace the line above with:
      // worker: "./workers/express/standard.ts",
    }),
  ],
  build: {
    outDir: fileURLToPath(new URL("./dist", import.meta.url)),
    emptyOutDir: true,
    target: "es2022",
  },
});

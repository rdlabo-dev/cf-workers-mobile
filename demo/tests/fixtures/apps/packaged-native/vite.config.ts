import { defineConfig } from "vite";
import { workersCapacitorPlugin } from "cf-workers-mobile/tooling/vite";
import { resolve } from "node:path";
export default defineConfig(({ mode }) => ({
  resolve: {
    alias: {
      "selected-worker": resolve(
        `workers/${mode === "express" ? "express.ts" : "hono.tsx"}`,
      ),
    },
  },
  plugins: [
    workersCapacitorPlugin({ execution: "local", worker: "./worker.ts" }),
  ],
  build: { target: "es2022" },
}));

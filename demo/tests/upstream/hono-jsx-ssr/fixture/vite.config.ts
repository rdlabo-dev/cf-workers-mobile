import { defineConfig } from "vite";
import { workersCapacitorPlugin } from "workers-capacitor/tooling/vite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const meta = JSON.parse(
  readFileSync(new URL("./upstream.json", import.meta.url), "utf8"),
);

export default defineConfig({
  resolve: {
    alias: {
      "upstream-worker": resolve(`./upstream/${meta.entry}`),
    },
  },
  plugins: [
    workersCapacitorPlugin({ execution: "local", worker: "./worker.ts" }),
  ],
  build: { target: "es2022" },
});

import { defineConfig } from "cf/config";

export const workers = {
  hono: {
    name: "workers-capacitor-poc-hono",
    compatibilityDate: "2026-10-01",
    entrypoint: "src/workers/hono/standard.ts",
    compatibilityFlags: [],
  },
  express: {
    name: "workers-capacitor-poc-express",
    compatibilityDate: "2026-10-01",
    entrypoint: "src/workers/express/standard.ts",
    compatibilityFlags: ["nodejs_compat"],
  },
};

export default defineConfig(({ mode }) => {
  if (mode !== "hono" && mode !== "express") {
    throw new Error("Select a Worker with --mode hono or --mode express");
  }
  return { worker: workers[mode] };
});

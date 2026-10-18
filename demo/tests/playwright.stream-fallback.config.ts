import { defineConfig } from "@playwright/test";
import production from "./playwright.runtime.config";
export default defineConfig({
  ...production,
  metadata: { streamsFallback: true },
  webServer: {
    ...production.webServer,
    command:
      "vite preview --config tests/fixtures/apps/runtime/vite.stream-fallback.config.ts --host 127.0.0.1 --port 4184 --strictPort",
    url: "http://127.0.0.1:4184",
    reuseExistingServer: false,
  },
  use: { baseURL: "http://127.0.0.1:4184" },
});

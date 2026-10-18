import { defineConfig } from "@playwright/test";
import runtime from "./playwright.runtime-dev.config";
export default defineConfig({
  ...runtime,
  testDir: "./stream-fallback",
  testMatch: "dev.spec.ts",
  use: { baseURL: "http://127.0.0.1:4185" },
  webServer: {
    ...runtime.webServer,
    command:
      "vite --force --config tests/fixtures/apps/runtime/vite.config.ts --host 127.0.0.1 --port 4185 --strictPort",
    url: "http://127.0.0.1:4185",
    reuseExistingServer: false,
  },
});

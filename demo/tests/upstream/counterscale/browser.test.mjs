import { waitForAcceptance } from "../../native/reports.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium, webkit } from "@playwright/test";
import { startBackend } from "./backend.mjs";
for (const engine of [chromium, webkit])
  test(
    `Counterscale ${process.env.COUNTERSCALE_LIVE_ANALYTICS === "1" ? "live analytics" : "authentication only"} in ${engine.name()}`,
    { timeout: 60000 },
    async () => {
      const backend = await startBackend();
      let browser;
      try {
        browser = await engine.launch();
        const page = await browser.newPage({ ignoreHTTPSErrors: true });
        await page.goto(backend.url.href);
        await waitForAcceptance(backend, 40000);
        assert.equal(
          backend.reports.find((r) => r.stage === "complete").scope,
          process.env.COUNTERSCALE_LIVE_ANALYTICS === "1"
            ? "live-analytics"
            : "authentication-only",
        );
      } finally {
        try {
          await browser?.close();
        } finally {
          await backend.close();
        }
      }
    },
  );

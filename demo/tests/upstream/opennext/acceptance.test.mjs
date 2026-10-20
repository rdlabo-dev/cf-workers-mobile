import { waitForAcceptance } from "../../native/reports.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium, webkit } from "@playwright/test";
import { startBackend } from "./backend.mjs";

test(
  "unmodified upstream Server Actions and streamed SSR",
  { timeout: 120000 },
  async () => {
    const backend = await startBackend();
    try {
      for (const engine of [chromium, webkit]) {
        backend.reports.length = 0;
        const browser = await engine.launch();
        try {
          const page = await browser.newPage({ ignoreHTTPSErrors: true });
          await page.goto(new URL("/server-actions", backend.url).href);
          await waitForAcceptance(backend, 60000);
          assert.ok(backend.reports.some((r) => r.stage === "action"));
          assert.ok(backend.reports.some((r) => r.stage === "form"));
          assert.equal(
            backend.reports.find((r) => r.stage === "fallback")?.duringSSR,
            true,
            "Fallback must render before the SSR response ends",
          );
          assert.equal(
            backend.reports.find((r) => r.stage === "complete").fallback,
            true,
          );
        } finally {
          await browser.close();
        }
      }
    } finally {
      await backend.close();
    }
  },
);

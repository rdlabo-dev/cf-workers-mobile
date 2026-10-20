import { waitForAcceptance } from "../../native/reports.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium, webkit } from "@playwright/test";
import { startBackend } from "./backend.mjs";
for (const engine of [chromium, webkit])
  test(
    `microfeed original Worker in ${engine.name()}`,
    { timeout: 120000 },
    async () => {
      const backend = await startBackend();
      let browser;
      try {
        browser = await engine.launch();
        const page = await browser.newPage({ ignoreHTTPSErrors: true });
        await page.goto(backend.url.href);
        await waitForAcceptance(backend, 40000);
        assert.ok(
          backend.requests.some(
            (r) => r.path.startsWith("/i/") && r.status === 200,
          ),
        );
        assert.ok(
          backend.requests.some((r) => r.path === "/rss/" && r.status === 200),
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

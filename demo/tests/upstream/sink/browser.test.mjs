import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium, webkit } from "@playwright/test";
import { startBackend } from "./backend.mjs";
for (const engine of [chromium, webkit])
  test(
    `Sink original Worker in ${engine.name()}`,
    { timeout: 60000 },
    async () => {
      const backend = await startBackend();
      let browser;
      try {
        browser = await engine.launch();
        const page = await browser.newPage({ ignoreHTTPSErrors: true });
        await page.goto(new URL("/dashboard/login", backend.url).href);
        const end = Date.now() + 40000;
        while (!backend.reports.some((r) => r.stage === "complete")) {
          assert.equal(
            backend.reports.find((r) => r.stage === "failure"),
            undefined,
            JSON.stringify(backend.reports),
          );
          assert.ok(
            Date.now() < end,
            JSON.stringify(backend.requests.slice(-10)),
          );
          await new Promise((r) => setTimeout(r, 100));
        }
        const row = await backend.db
          .prepare("SELECT url FROM links WHERE slug = ?")
          .bind("capacitor-acceptance")
          .first();
        assert.equal(row?.url, "https://example.com/capacitor-acceptance");
      } finally {
        try {
          await browser?.close();
        } finally {
          await backend.close();
        }
      }
    },
  );

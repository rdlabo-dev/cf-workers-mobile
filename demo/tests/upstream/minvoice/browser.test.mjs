import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium, webkit } from "@playwright/test";
import { startBackend } from "./backend.mjs";
for (const engine of [chromium, webkit])
  test(
    `Minvoice original Worker in ${engine.name()}`,
    { timeout: 60000 },
    async () => {
      const backend = await startBackend();
      const browser = await engine.launch();
      try {
        const page = await browser.newPage({ ignoreHTTPSErrors: true });
        await page.goto(new URL("/admin", backend.url).href);
        const end = Date.now() + 20000;
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
        assert.equal(
          (
            await backend.db
              .prepare(
                "SELECT COUNT(*) AS n FROM invoices WHERE subject = 'Native invoice'",
              )
              .first()
          ).n,
          1,
        );
      } finally {
        await browser.close();
        await backend.close();
      }
    },
  );

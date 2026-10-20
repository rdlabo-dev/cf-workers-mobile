import { waitForAcceptance } from "../../native/reports.mjs";
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
        await waitForAcceptance(backend, 20000);
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

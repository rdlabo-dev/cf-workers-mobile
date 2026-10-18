import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestHarness } from "wrangler";
import { cases } from "./cases";
import { metadata, workerEntry } from "./sample";

// The original Worker is the baseline; browser.spec.ts applies the same
// expectations through workersCapacitor in direct and isolated execution.
describe("upstream honojs/examples jsx-ssr", () => {
  const harness = createTestHarness({
    workers: [
      {
        config: {
          name: "upstream-hono-jsx-ssr",
          main: workerEntry,
          compatibility_date: metadata.compatibilityDate,
        },
      },
    ],
  });
  beforeAll(() => harness.listen());
  afterAll(() => harness.close());
  for (const sample of cases) {
    it(`GET ${sample.path}`, async () => {
      const response = await harness.fetch(sample.path);
      expect(response.status).toBe(sample.status);
      expect(response.headers.get("content-type")).toContain(
        sample.contentType,
      );
      const body = await response.text();
      for (const text of sample.text) expect(body).toContain(text);
    });
  }
});

import { afterAll, beforeAll, expect, it } from "vitest";
import { createTestHarness } from "wrangler";
const harness = createTestHarness({
  workers: [
    {
      config: {
        name: "environment",
        main: "tests/fixtures/workers/compatibility/environment.ts",
        compatibility_date: "2026-10-17",
        compatibility_flags: ["nodejs_compat"],
      },
    },
  ],
});
beforeAll(() => harness.listen());
afterAll(() => harness.close());
it("uses native async context in Cloudflare without browser build plugins", async () => {
  expect(await (await harness.fetch("/")).json()).toEqual({
    environment: "cloudflare-workers",
    values: ["first", "second"],
    after: null,
  });
});

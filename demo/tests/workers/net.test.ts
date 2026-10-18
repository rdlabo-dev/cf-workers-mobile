import { afterAll, beforeAll, expect, it } from "vitest";
import { createTestHarness } from "wrangler";
import {
  assertContract,
  type ContractResult,
} from "@rdlabo/capacitor-workers/testing";
const harness = createTestHarness({
  workers: [
    {
      config: {
        name: "net",
        main: "tests/fixtures/workers/compatibility/net.ts",
        compatibility_date: "2026-10-17",
      },
    },
  ],
});
beforeAll(() => harness.listen());
afterAll(() => harness.close());
it("runs net contracts in pinned workerd", async () => {
  const report = (await (await harness.fetch("/")).json()) as ContractResult;
  assertContract(report);
});

it("accepts TCP through the public Workers bridge", async () => {
  const response = await harness.fetch("/incoming");
  expect(await response.text()).toBe("ok");
});

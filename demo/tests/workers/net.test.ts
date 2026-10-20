import expectedCases from "../validation/expected-cases.json" with { type: "json" };
import { afterAll, beforeAll, expect, it } from "vitest";
import { createTestHarness } from "wrangler";
import {
  assertContract,
  type ContractResult,
} from "cf-workers-mobile/shared/contracts/testing";
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
  expect(report.cases.map((test) => test.id)).toEqual(
    expectedCases["node.net"],
  );
  expect(report.cases.every((test) => test.status === "passed")).toBe(true);
});

it("accepts TCP through the public Workers bridge", async () => {
  const response = await harness.fetch("/incoming");
  expect(await response.text()).toBe("ok");
});

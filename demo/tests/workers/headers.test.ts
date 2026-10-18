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
        name: "headers-compat",
        main: "tests/fixtures/workers/compatibility/headers.ts",
        compatibility_date: "2026-10-17",
      },
    },
  ],
});
beforeAll(async () => {
  await harness.listen();
});
afterAll(async () => {
  await harness.close();
});

it("matches native workerd Headers with the same module-owned contract", async () => {
  const reports = (await (await harness.fetch("/")).json()) as Record<
    string,
    ContractResult
  >;
  for (const report of Object.values(reports)) {
    assertContract(report);
    expect(report.cases).toHaveLength(8);
    expect(report.cases.every((test) => test.status === "passed")).toBe(true);
  }
  expect(reports.candidate).toEqual(reports.baseline);
});

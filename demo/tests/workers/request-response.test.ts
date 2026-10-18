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
        name: "request-response-compat",
        main: "tests/fixtures/workers/compatibility/request-response.ts",
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
it("compares Request/Response candidates against the pinned workerd contract", async () => {
  const reports = (await (await harness.fetch("/")).json()) as Record<
    string,
    ContractResult
  >;
  for (const report of Object.values(reports)) {
    assertContract(report);
    expect(report.cases).toHaveLength(8);
    expect(report.cases.filter((test) => test.status !== "passed")).toEqual([]);
  }
  expect(reports.requestCandidate).toEqual(reports.request);
  expect(reports.responseCandidate).toEqual(reports.response);
});

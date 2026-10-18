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
        name: "node-compat",
        main: "tests/fixtures/workers/compatibility/node.ts",
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

it("runs the node module contracts against real workerd", async () => {
  const reports = (await (await harness.fetch("/")).json()) as ContractResult[];
  expect(reports.map((report) => report.feature)).toEqual([
    "node.path",
    "node.querystring",
    "node.string_decoder",
    "node.http",
    "node.net",
  ]);
  expect(reports.map((report) => report.cases.length)).toEqual([
    14, 11, 15, 18, 9,
  ]);
  for (const report of reports) assertContract(report);
  expect(
    reports
      .flatMap((report) => report.cases)
      .every((test) => test.status === "passed"),
  ).toBe(true);
});

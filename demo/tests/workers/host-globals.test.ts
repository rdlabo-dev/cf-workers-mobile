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
        name: "host-globals",
        main: "tests/fixtures/workers/compatibility/host-globals.ts",
        compatibility_date: "2026-10-17",
      },
    },
  ],
});
beforeAll(() => harness.listen());
afterAll(() => harness.close());
it.each(["encoding", "abort"])(
  "runs %s contracts in pinned workerd",
  async (api) => {
    const report = (await (
      await harness.fetch(`/${api}`)
    ).json()) as ContractResult;
    expect(report.cases).toHaveLength(6);
    assertContract(report);
  },
);

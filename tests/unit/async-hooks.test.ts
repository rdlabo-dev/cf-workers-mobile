import { expect, it } from "vitest";
import { runContract } from "@rdlabo/capacitor-workers/testing";
import {
  AsyncHooksImplementation,
  asyncHooksContract,
} from "../../src/compat/async-hooks/index.spec";

it("async-hooks contract", async () => {
  const report = await runContract(
    new AsyncHooksImplementation(),
    asyncHooksContract,
  );
  expect(report.cases.filter((c) => c.status === "failed")).toEqual([]);
});

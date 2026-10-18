import {
  AsyncLocalStorage,
  AsyncResource,
} from "../../src/compat/async-hooks/index";
import { expect, it } from "vitest";
import { runContract } from "@rdlabo/capacitor-workers/testing";
import {
  AsyncHooksImplementation,
  asyncHooksContract,
} from "../../src/compat/async-hooks/index.spec";

it("async-hooks contract", async () => {
  const report = await runContract(
    new AsyncHooksImplementation({ AsyncLocalStorage, AsyncResource }),
    asyncHooksContract,
  );
  expect(report.cases.filter((c) => c.status === "failed")).toEqual([]);
});

import { expect, it } from "vitest";
import * as local from "../../src/compat/stream/index.js";
import {
  streamContract,
  StreamImplementation,
} from "../../src/compat/stream/index.spec.js";
import { runContract } from "@rdlabo/workers-capacitor/shared/contracts/testing";
it("runs the pinned Workers stream contract", async () => {
  const report = await runContract(
    new StreamImplementation(
      local as unknown as ConstructorParameters<typeof StreamImplementation>[0],
    ),
    streamContract,
  );
  expect(report.errors).toEqual([]);
  expect(report.cases.filter((c) => c.status !== "passed")).toEqual([]);
});

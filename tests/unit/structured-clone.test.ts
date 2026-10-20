import { expect, it } from "vitest";
import {
  assertContract,
  runContract,
} from "cf-workers-mobile/shared/contracts/testing";
import {
  localStructuredCloneApi,
  StructuredCloneImplementation,
  structuredCloneContract,
} from "../../src/browser/structured-clone/index.spec.js";

it("runs the structuredClone contract against the browser candidate", async () => {
  const report = await runContract(
    new StructuredCloneImplementation(localStructuredCloneApi),
    structuredCloneContract,
  );
  assertContract(report);
  expect(report.cases).toHaveLength(11);
  expect(report.cases.filter((test) => test.status !== "passed")).toEqual([]);
});

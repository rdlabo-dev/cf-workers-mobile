import { it, expect, vi } from "vitest";
import * as api from "../../src/compat/diagnostics-channel/index.js";
import {
  diagnosticsContract,
  DiagnosticsImplementation,
} from "../../src/compat/diagnostics-channel/index.spec.js";
import {
  assertContract,
  runContract,
} from "cf-workers-mobile/shared/contracts/testing";
it("matches the Workers diagnostics contract", async () => {
  const report = await runContract(
    new DiagnosticsImplementation(api),
    diagnosticsContract,
  );
  assertContract(report);
  expect(report.cases.filter((c) => c.status !== "passed")).toEqual([]);
});

vi.mock(
  "node:async_hooks",
  () => import("../../src/compat/async-hooks/index.js"),
);

import { expect, it } from "vitest";
import { runContract } from "cf-workers-native/shared/contracts/testing";
import * as api from "../../src/compat/tls-common/index.js";
import {
  TlsCommonImplementation,
  tlsCommonContract,
} from "../../src/compat/tls-common/index.spec.js";

it("preserves Workers TLS context and certificate translation behavior", async () => {
  const report = await runContract(
    new TlsCommonImplementation(api),
    tlsCommonContract,
  );
  expect(report.errors).toEqual([]);
  expect(report.cases.filter((result) => result.status !== "passed")).toEqual(
    [],
  );
});

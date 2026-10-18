import { installWebGlobals } from "../../src/compat/globals/web.js";
import * as localUtil from "../../src/compat/util/index";
import * as localStreams from "../../src/compat/stream-web/index";
import { expect, it } from "vitest";
import { runContract } from "@rdlabo/capacitor-workers/testing";
import { FsImplementation, fsContract } from "../../src/compat/fs/index.spec";
import {
  ModuleImplementation,
  moduleContract,
} from "../../src/compat/module/index.spec";
import {
  StreamWebImplementation,
  streamWebContract,
} from "../../src/compat/stream-web/index.spec";
import {
  UtilImplementation,
  utilContract,
} from "../../src/compat/util/index.spec";

it("fs contract", async () => {
  const report = await runContract(new FsImplementation(), fsContract);
  expect(report.cases.filter((c) => c.status === "failed")).toEqual([]);
});
it("module contract", async () => {
  const report = await runContract(new ModuleImplementation(), moduleContract);
  expect(report.cases.filter((c) => c.status === "failed")).toEqual([]);
});
it("stream-web contract", async () => {
  const release = installWebGlobals();
  try {
    const report = await runContract(
      new StreamWebImplementation(localStreams),
      streamWebContract,
    );
    expect(report.cases.filter((c) => c.status === "failed")).toEqual([]);
  } finally {
    release();
  }
});
it("util contract", async () => {
  const report = await runContract(
    new UtilImplementation(localUtil),
    utilContract,
  );
  expect(report.cases.filter((c) => c.status === "failed")).toEqual([]);
});

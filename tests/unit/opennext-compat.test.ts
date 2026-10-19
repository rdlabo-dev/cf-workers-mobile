import { installWebGlobals } from "../../src/shared/globals/web.js";
import * as localUtil from "../../src/compat/util/index";
import * as localStreams from "../../src/compat/stream-web/index";
import { expect, it } from "vitest";
import { runContract } from "workers-capacitor/shared/contracts/testing";
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
  expect(report.errors).toEqual([]);
  expect(report.cases.filter((c) => c.status !== "passed")).toEqual([]);
});
it("module contract", async () => {
  const report = await runContract(new ModuleImplementation(), moduleContract);
  expect(report.errors).toEqual([]);
  expect(report.cases.filter((c) => c.status !== "passed")).toEqual([]);
});
it("stream-web contract", async () => {
  const nativeFile = Object.getOwnPropertyDescriptor(globalThis, "File")!;
  const release = installWebGlobals();
  const installedFile = Object.getOwnPropertyDescriptor(globalThis, "File")!;
  // Undici's multipart parser constructs global File and then validates its
  // private native brand. Keep that Node-only codec dependency for this test;
  // the browser and workerd contracts exercise the installed File constructor.
  Object.defineProperty(globalThis, "File", nativeFile);
  try {
    const report = await runContract(
      new StreamWebImplementation(localStreams),
      streamWebContract,
    );
    expect(report.errors).toEqual([]);
    expect(report.cases.filter((c) => c.status !== "passed")).toEqual([]);
  } finally {
    Object.defineProperty(globalThis, "File", installedFile);
    release();
  }
});
it("util contract", async () => {
  const report = await runContract(
    new UtilImplementation(localUtil),
    utilContract,
  );
  expect(report.errors).toEqual([]);
  expect(report.cases.filter((c) => c.status !== "passed")).toEqual([]);
});

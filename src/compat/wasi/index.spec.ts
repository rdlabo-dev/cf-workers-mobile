import wasi, * as namespace from "node:wasi";
import {
  defineFeature,
  FeatureImplementation,
} from "@rdlabo/capacitor-workers/features";
import type { ContractSuite } from "@rdlabo/capacitor-workers/testing";
const groups = [
  "exports",
  "unsupported",
  "options",
  "version",
  "collections",
  "descriptors",
  "returnOnExit",
  "prototype",
] as const;
export const wasiFeature = defineFeature<typeof wasi>()("node.wasi", groups);
function equal(a: unknown, b: unknown) {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`);
}
function failure(fn: () => unknown, code: string, method?: string) {
  try {
    fn();
  } catch (e) {
    const error = e as Error & { code: string };
    equal(error.code, code);
    if (method) {
      equal(error.name, "Error");
      equal(error.message, `The ${method} method is not implemented`);
      equal(
        String(error),
        `Error [${code}]: The ${method} method is not implemented`,
      );
    }
    return;
  }
  throw new Error(`Expected ${code}`);
}
export const wasiContract: ContractSuite<typeof wasiFeature> = {
  feature: wasiFeature,
  cases: {
    exports(api) {
      equal(Object.keys(api), ["WASI"]);
      equal(Object.keys(namespace).sort(), ["WASI", "default"]);
      equal(api.WASI === namespace.WASI, true);
      equal(Object.getOwnPropertyNames(api.WASI.prototype).sort(), [
        "constructor",
        "finalizeBindings",
        "getImportObject",
        "initialize",
        "start",
      ]);
    },
    unsupported(api) {
      for (const options of [
        undefined,
        { version: "preview1" },
        { version: "unstable" },
        {
          version: "preview1",
          args: [1],
          env: { a: 1 },
          preopens: {},
          stdin: 0,
          stdout: 1,
          stderr: 2,
          returnOnExit: true,
        },
      ])
        failure(
          () => new api.WASI(options as never),
          "ERR_METHOD_NOT_IMPLEMENTED",
          "WASI",
        );
    },
    options(api) {
      for (const options of [null, [], false, "", 0, () => {}])
        failure(() => new api.WASI(options as never), "ERR_INVALID_ARG_TYPE");
    },
    version(api) {
      for (const version of [undefined, null, "", 1, false, Symbol("version")])
        failure(
          () => new api.WASI({ version } as never),
          "ERR_INVALID_ARG_VALUE",
        );
    },
    collections(api) {
      for (const args of [null, {}, false, "arg"])
        failure(
          () => new api.WASI({ version: "preview1", args } as never),
          "ERR_INVALID_ARG_TYPE",
        );
      for (const key of ["env", "preopens"]) {
        for (const value of [null, [], false, "", () => {}])
          failure(
            () => new api.WASI({ version: "preview1", [key]: value } as never),
            "ERR_INVALID_ARG_TYPE",
          );
      }
    },
    descriptors(api) {
      for (const key of ["stdin", "stdout", "stderr"]) {
        for (const value of [null, "1", false, {}, 1n])
          failure(
            () => new api.WASI({ version: "preview1", [key]: value } as never),
            "ERR_INVALID_ARG_TYPE",
          );
        for (const value of [-1, NaN, Infinity, 1.5, 2 ** 31])
          failure(
            () => new api.WASI({ version: "preview1", [key]: value } as never),
            "ERR_OUT_OF_RANGE",
          );
      }
    },
    returnOnExit(api) {
      for (const value of [null, 0, "true", {}])
        failure(
          () =>
            new api.WASI({ version: "preview1", returnOnExit: value } as never),
          "ERR_INVALID_ARG_TYPE",
        );
    },
    prototype(api) {
      const proto = api.WASI.prototype as unknown as Record<
        string,
        (...args: unknown[]) => unknown
      >;
      for (const method of ["start", "initialize", "finalizeBindings"])
        failure(
          () => Reflect.apply(proto[method]!, {}, []),
          "ERR_METHOD_NOT_IMPLEMENTED",
          `WASI.${method}`,
        );
      equal(proto.getImportObject!(), {});
      equal(proto.getImportObject!() === proto.getImportObject!(), false);
      const seen: string[] = [];
      const options = {
        get version() {
          seen.push("version");
          return "preview1";
        },
        get args() {
          seen.push("args");
          return null;
        },
        get env() {
          throw new Error("wrong validation order");
        },
      };
      failure(() => new api.WASI(options as never), "ERR_INVALID_ARG_TYPE");
      equal(seen, ["version", "args", "args"]);
    },
  },
};
export class WasiImplementation extends FeatureImplementation<
  typeof wasiFeature
> {
  constructor() {
    super(wasiFeature, {
      exports: { status: "supported" },
      unsupported: { status: "supported" },
      options: { status: "supported" },
      version: { status: "supported" },
      collections: { status: "supported" },
      descriptors: { status: "supported" },
      returnOnExit: { status: "supported" },
      prototype: { status: "supported" },
    });
  }
  create() {
    return wasi;
  }
}

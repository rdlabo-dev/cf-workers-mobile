import vm, * as namespace from "node:vm";
import { Buffer } from "node:buffer";
import {
  defineFeature,
  FeatureImplementation,
} from "@rdlabo/capacitor-workers/features";
import type { ContractSuite } from "@rdlabo/capacitor-workers/testing";
import type local from "./index.js";
type Api = typeof local;
const groups = [
  "exports",
  "context",
  "contextValidation",
  "script",
  "scriptValidation",
  "execution",
  "executionValidation",
  "compile",
  "compileValidation",
  "memory",
] as const;
export const vmFeature = defineFeature<Api>()("node.vm", groups);
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
    if (method) equal(error.message, `The ${method} method is not implemented`);
    return;
  }
  throw new Error(`Expected ${code}`);
}
const unsupported = (fn: () => unknown, name: string) =>
  failure(fn, "ERR_METHOD_NOT_IMPLEMENTED", name);
export const vmContract: ContractSuite<typeof vmFeature> = {
  feature: vmFeature,
  cases: {
    exports(api) {
      const names = [
        "Script",
        "createContext",
        "createScript",
        "runInContext",
        "runInNewContext",
        "runInThisContext",
        "isContext",
        "compileFunction",
        "measureMemory",
        "constants",
      ].sort();
      equal(Object.keys(api).sort(), names);
      equal(Object.keys(namespace).sort(), [...names, "default"].sort());
      for (const name of names)
        equal(
          api[name as keyof Api] ===
            (namespace as unknown as Api)[name as keyof Api],
          true,
        );
      equal(
        Object.getOwnPropertyNames(api.Script.prototype).sort(),
        [
          "constructor",
          "createCachedData",
          "runInThisContext",
          "runInContext",
          "runInNewContext",
        ].sort(),
      );
      equal(Object.keys(api.constants).sort(), [
        "DONT_CONTEXTIFY",
        "USE_MAIN_CONTEXT_DEFAULT_LOADER",
      ]);
      equal(Object.isFrozen(api.constants), true);
      equal(Object.getPrototypeOf(api.constants), null);
    },
    context(api) {
      const original = { a: 1 };
      const ctx = api.createContext(original);
      equal(ctx === original, false);
      equal(Object.getPrototypeOf(ctx), null);
      equal(Object.keys(ctx), []);
      equal(api.isContext(ctx), true);
      equal(api.isContext(original), false);
      equal(api.isContext([]), false);
      equal(api.createContext(ctx) === ctx, true);
      equal(api.createContext(ctx, null as never) === ctx, true);
      equal(
        api.isContext(
          api.createContext(api.constants.DONT_CONTEXTIFY as never),
        ),
        true,
      );
      equal(api.createContext() === api.createContext(), false);
    },
    contextValidation(api) {
      for (const value of [null, 1, "x", false, () => {}])
        failure(() => api.isContext(value), "ERR_INVALID_ARG_TYPE");
      for (const value of [null, [], false, 1])
        failure(
          () => api.createContext({}, value as never),
          "ERR_INVALID_ARG_TYPE",
        );
      for (const options of [
        { name: 1 },
        { origin: 1 },
        { codeGeneration: null },
        { codeGeneration: { strings: 1 } },
        { codeGeneration: { wasm: 1 } },
        { importModuleDynamically: () => {} },
      ])
        failure(
          () => api.createContext({}, options as never),
          "ERR_INVALID_ARG_TYPE",
        );
      failure(
        () => api.createContext({}, { microtaskMode: "bad" } as never),
        "ERR_INVALID_ARG_VALUE",
      );
      equal(
        api.isContext(
          api.createContext(
            {},
            {
              codeGeneration: { strings: false, wasm: false },
              microtaskMode: "afterEvaluate",
            },
          ),
        ),
        true,
      );
    },
    script(api) {
      const script = new api.Script('throw new Error("must not execute")');
      equal(script instanceof api.Script, true);
      equal(
        Object.keys(script).sort(),
        [
          "cachedDataRejected",
          "cachedDataProduced",
          "cachedData",
          "sourceMapURL",
        ].sort(),
      );
      for (const key of Object.keys(script))
        equal(script[key as keyof typeof script], undefined);
      equal(Buffer.isBuffer(script.createCachedData()), true);
      equal(script.createCachedData().length, 0);
      equal(script.createCachedData() === script.createCachedData(), false);
      equal(api.createScript("x") instanceof api.Script, true);
      let calls = 0;
      new api.Script(
        {
          toString() {
            calls++;
            return "x";
          },
        } as never,
        "test.js",
      );
      equal(calls, 1);
      let coercionError: unknown;
      try {
        new api.Script(Symbol("code") as never);
      } catch (error) {
        coercionError = error;
      }
      equal(coercionError instanceof TypeError, true);
      const sentinel = {};
      let observed: unknown;
      try {
        new api.Script(
          {
            toString() {
              throw sentinel;
            },
          } as never,
          null as never,
        );
      } catch (error) {
        observed = error;
      }
      equal(observed === sentinel, true);

      for (const cachedData of [
        new Uint8Array(1),
        new DataView(new ArrayBuffer(1)),
      ])
        equal(
          new api.Script("", { cachedData } as never).cachedData,
          undefined,
        );
    },
    scriptValidation(api) {
      for (const options of [null, [], 1, false])
        failure(
          () => new api.Script("", options as never),
          "ERR_INVALID_ARG_TYPE",
        );
      for (const options of [
        { filename: 1 },
        { lineOffset: "1" },
        { columnOffset: null },
        { cachedData: new ArrayBuffer(1) },
        { produceCachedData: 1 },
        { importModuleDynamically: () => {} },
      ])
        failure(
          () => new api.Script("", options as never),
          "ERR_INVALID_ARG_TYPE",
        );
      for (const value of [NaN, 1.5, 2 ** 31, -(2 ** 31) - 1])
        failure(
          () => new api.Script("", { lineOffset: value }),
          "ERR_OUT_OF_RANGE",
        );
    },
    execution(api) {
      const ctx = api.createContext();
      const script = new api.Script("globalThis.shouldNotExist=true");
      unsupported(() => script.runInThisContext(), "runInThisContext");
      unsupported(() => script.runInContext(ctx), "runInThisContext");
      unsupported(() => script.runInNewContext({}), "runInThisContext");
      unsupported(() => api.runInThisContext("x"), "runInThisContext");
      unsupported(() => api.runInContext("x", ctx), "runInThisContext");
      unsupported(() => api.runInNewContext("x", {}), "runInThisContext");
    },
    executionValidation(api) {
      const script = new api.Script("");
      failure(() => script.runInContext({}), "ERR_INVALID_ARG_TYPE");
      failure(
        () => script.runInThisContext(null as never),
        "ERR_INVALID_ARG_TYPE",
      );
      for (const options of [
        { breakOnSigint: 1 },
        { displayErrors: 1 },
        { timeout: "1" },
      ])
        failure(
          () => script.runInThisContext(options as never),
          "ERR_INVALID_ARG_TYPE",
        );
      for (const timeout of [0, -1, NaN, Infinity, 2 ** 32])
        failure(() => script.runInThisContext({ timeout }), "ERR_OUT_OF_RANGE");
      for (const options of [
        { contextName: 1 },
        { contextOrigin: 1 },
        { contextCodeGeneration: null },
        { contextCodeGeneration: { strings: 1 } },
        { microtaskMode: 1 },
      ])
        failure(
          () => api.runInNewContext("", {}, options as never),
          "ERR_INVALID_ARG_TYPE",
        );
    },
    compile(api) {
      unsupported(() => api.compileFunction("return 1"), "compileFunction");
      unsupported(
        () =>
          api.compileFunction("", ["a"], {
            contextExtensions: [null, {}],
          } as never),
        "compileFunction",
      );
    },
    compileValidation(api) {
      for (const value of [null, 1, {}, () => {}])
        failure(
          () => api.compileFunction(value as string),
          "ERR_INVALID_ARG_TYPE",
        );
      for (const params of [null, {}, [1], ["a", undefined]])
        failure(
          () => api.compileFunction("", params as never),
          "ERR_INVALID_ARG_TYPE",
        );
      for (const options of [
        null,
        [],
        1,
        { filename: 1 },
        { columnOffset: null },
        { lineOffset: "x" },
        { cachedData: [] },
        { produceCachedData: 1 },
        { importModuleDynamically: () => {} },
        { parsingContext: {} },
        { contextExtensions: 1 },
        { contextExtensions: [1] },
        { contextExtensions: [[]] },
      ])
        failure(
          () => api.compileFunction("", [], options as never),
          "ERR_INVALID_ARG_TYPE",
        );
    },
    memory(api) {
      unsupported(() => api.measureMemory(), "measureMemory");
      unsupported(
        () => api.measureMemory({ mode: "detailed", execution: "eager" }),
        "measureMemory",
      );
      for (const value of [null, [], 1])
        failure(
          () => api.measureMemory(value as never),
          "ERR_INVALID_ARG_TYPE",
        );
      for (const options of [{ mode: "x" }, { execution: "x" }])
        failure(
          () => api.measureMemory(options as never),
          "ERR_INVALID_ARG_VALUE",
        );
    },
  },
};
export class VmImplementation extends FeatureImplementation<typeof vmFeature> {
  constructor() {
    super(vmFeature, {
      exports: { status: "supported" },
      context: { status: "supported" },
      contextValidation: { status: "supported" },
      script: { status: "supported" },
      scriptValidation: { status: "supported" },
      execution: { status: "supported" },
      executionValidation: { status: "supported" },
      compile: { status: "supported" },
      compileValidation: { status: "supported" },
      memory: { status: "supported" },
    });
  }
  create() {
    return vm as unknown as Api;
  }
}

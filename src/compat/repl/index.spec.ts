import api, * as namespace from "node:repl";
import { EventEmitter } from "node:events";
import {
  defineFeature,
  FeatureImplementation,
} from "workers-capacitor/shared/contracts";
import type { ContractSuite } from "workers-capacitor/shared/contracts/testing";
import type local from "./index.js";
type Api = typeof local;
function equal(a: unknown, b: unknown) {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`);
}
function same(a: unknown, b: unknown) {
  if (a !== b) throw Error("Identity mismatch");
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
  throw Error(`Expected ${code}`);
}
const unsupported = (fn: () => unknown, method: string) =>
  failure(fn, "ERR_METHOD_NOT_IMPLEMENTED", method);
import { expectedBuiltinModules } from "./values.spec";
import { Interface } from "node:readline/promises";
export const replFeature = defineFeature<Api>()("node.repl", [
  "exports",
  "builtins",
  "writer",
  "unsupported",
  "recoverable",
  "prototype",
] as const);
export const replContract: ContractSuite<typeof replFeature> = {
  feature: replFeature,
  cases: {
    exports(api) {
      const names = [
        "writer",
        "start",
        "Recoverable",
        "REPLServer",
        "builtinModules",
        "_builtinLibs",
        "REPL_MODE_SLOPPY",
        "REPL_MODE_STRICT",
      ].sort();
      equal(Object.keys(api).sort(), names);
      equal(Object.keys(namespace).sort(), [...names, "default"].sort());
      for (const name of names)
        same(
          api[name as keyof Api],
          (namespace as unknown as Api)[name as keyof Api],
        );
      same(api.REPL_MODE_SLOPPY.description, "repl-sloppy");
      same(api.REPL_MODE_STRICT.description, "repl-strict");
      same(
        (api.REPL_MODE_STRICT as symbol) === (api.REPL_MODE_SLOPPY as symbol),
        false,
      );
    },
    builtins(api) {
      equal(api.builtinModules, expectedBuiltinModules);
      same(api._builtinLibs, api.builtinModules);
      same(Object.isFrozen(api.builtinModules), false);
      const length = api.builtinModules.length;
      try {
        api.builtinModules.push("example");
        same(api._builtinLibs[length], "example");
      } finally {
        api.builtinModules.length = length;
      }
    },
    writer(api) {
      equal((api.writer as any).options, {
        showHidden: false,
        depth: 2,
        colors: true,
        customInspect: true,
        showProxy: true,
        maxArrayLength: 100,
        maxStringLength: 10000,
        breakLength: 80,
        compact: 3,
        sorted: false,
        getters: false,
        numericSeparator: false,
      });
      unsupported(() => api.writer(), "writer");
    },
    unsupported(api) {
      unsupported(() => api.start(), "start");
      unsupported(() => new api.REPLServer(), "REPLServer");
      for (const name of [
        "setupHistory",
        "defineCommand",
        "displayPrompt",
        "clearBufferedCommand",
      ] as const)
        unsupported(
          () => Reflect.apply(api.REPLServer.prototype[name], {}, []),
          name,
        );
    },
    recoverable(api) {
      const error = new Error("example");
      const value = new api.Recoverable(error);
      same(value instanceof SyntaxError, true);
      same(value.err, error);
      same(value.message, "");
      same(new api.Recoverable(null as never).err, null);
    },
    prototype(api) {
      same(
        Object.getPrototypeOf(api.REPLServer.prototype),
        Interface.prototype,
      );
      same(
        Object.getPrototypeOf(api.Recoverable.prototype),
        SyntaxError.prototype,
      );
      equal(
        Object.getOwnPropertyNames(api.REPLServer.prototype).sort(),
        [
          "constructor",
          "setupHistory",
          "defineCommand",
          "displayPrompt",
          "clearBufferedCommand",
        ].sort(),
      );
    },
  },
};
export class ReplImplementation extends FeatureImplementation<
  typeof replFeature
> {
  constructor() {
    super(replFeature, {
      exports: { status: "supported" },
      builtins: { status: "supported" },
      writer: { status: "supported" },
      unsupported: { status: "supported" },
      recoverable: { status: "supported" },
      prototype: { status: "supported" },
    });
  }
  create() {
    return api as unknown as Api;
  }
}

import api, * as namespace from "node:child_process";
import { EventEmitter } from "node:events";
import {
  defineFeature,
  FeatureImplementation,
} from "@rdlabo/capacitor-workers/features";
import type { ContractSuite } from "@rdlabo/capacitor-workers/testing";
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
export const childProcessFeature = defineFeature<Api>()("node.child_process", [
  "exports",
  "unsupported",
  "execValidation",
  "forkValidation",
  "prototype",
] as const);
export const childProcessContract: ContractSuite<typeof childProcessFeature> = {
  feature: childProcessFeature,
  cases: {
    exports(api) {
      const names = [
        "ChildProcess",
        "_forkChild",
        "exec",
        "execFile",
        "execFileSync",
        "execSync",
        "fork",
        "spawn",
        "spawnSync",
      ].sort();
      equal(Object.keys(api).sort(), names);
      equal(Object.keys(namespace).sort(), [...names, "default"].sort());
      for (const name of names)
        same(
          api[name as keyof Api],
          (namespace as unknown as Api)[name as keyof Api],
        );
      same(
        Object.getPrototypeOf(api.ChildProcess.prototype),
        EventEmitter.prototype,
      );
    },
    unsupported(api) {
      unsupported(() => new api.ChildProcess(), "child_process.ChildProcess");
      for (const name of [
        "_forkChild",
        "execFile",
        "execFileSync",
        "execSync",
        "spawn",
      ] as const)
        unsupported(
          () => Reflect.apply(api[name], undefined, []),
          `child_process.${name}`,
        );
      unsupported(() => api.spawnSync("echo"), "child_process.spawnSync");
      failure(() => api.spawnSync(null as never), "ERR_INVALID_ARG_TYPE");
    },
    execValidation(api) {
      for (const options of [undefined, null, {}])
        unsupported(() => api.exec("echo", options), "child_process.exec");
      failure(() => api.exec(1 as never, {}), "ERR_INVALID_ARG_TYPE");
      for (const options of [true, [], () => {}])
        failure(() => api.exec("x", options as never), "ERR_INVALID_ARG_TYPE");
      failure(() => api.exec("x", {}, 1 as never), "ERR_INVALID_ARG_TYPE");
      unsupported(() => api.exec("x", {}, () => {}), "child_process.exec");
    },
    forkValidation(api) {
      for (const args of [undefined, null, [], {}, { silent: true }])
        unsupported(() => api.fork("x", args as never), "child_process.fork");
      for (const args of [1, true, "x"])
        failure(() => api.fork("x", args as never), "ERR_INVALID_ARG_TYPE");
      failure(() => api.fork("x", [], true as never), "ERR_INVALID_ARG_TYPE");
      unsupported(() => api.fork(null as never, []), "child_process.fork");
    },
    prototype(api) {
      const proto = api.ChildProcess.prototype;
      equal(
        Object.getOwnPropertyNames(proto).sort(),
        ["constructor", "kill", "send", "disconnect", "unref", "ref"].sort(),
      );
      const receiver = {} as never;
      equal(proto.kill.call(receiver), false);
      equal(proto.send.call(receiver, "x"), false);
      for (const name of ["disconnect", "ref", "unref"] as const)
        same(proto[name].call(receiver), undefined);
      const dispose = Symbol.dispose ?? Symbol.for("Symbol.dispose");
      let calls = 0;
      same(
        Reflect.apply(
          (proto as any)[dispose],
          {
            kill() {
              calls++;
            },
          },
          [],
        ),
        undefined,
      );
      equal(calls, 1);
    },
  },
};
export class ChildProcessImplementation extends FeatureImplementation<
  typeof childProcessFeature
> {
  constructor() {
    super(childProcessFeature, {
      exports: { status: "supported" },
      unsupported: { status: "supported" },
      execValidation: { status: "supported" },
      forkValidation: { status: "supported" },
      prototype: { status: "supported" },
    });
  }
  create() {
    return api as unknown as Api;
  }
}

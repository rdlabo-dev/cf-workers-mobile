import actual, * as namespace from "node:test";
import {
  defineFeature,
  FeatureImplementation,
} from "@rdlabo/capacitor-workers/features";
import type { ContractSuite } from "@rdlabo/capacitor-workers/testing";
import type local from "./index.js";
type Api = typeof local;
const groups = [
  "exports",
  "fn",
  "overloads",
  "calls",
  "implementation",
  "once",
  "times",
  "method",
  "accessors",
  "restoration",
  "construct",
  "errors",
  "validation",
  "context",
] as const;
export const testFeature = defineFeature<Api>()("node.test", groups);
function equal(a: unknown, b: unknown) {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`);
}
function same(a: unknown, b: unknown) {
  if (a !== b) throw Error(`Identity mismatch: ${String(a)} / ${String(b)}`);
}
function failure(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (e) {
    same((e as any).code, code);
    return;
  }
  throw Error(`Expected ${code}`);
}
const tracker = (api: Api): any => new api.MockTracker();
export const testContract: ContractSuite<typeof testFeature> = {
  feature: testFeature,
  cases: {
    exports(api) {
      const names = ["MockFunctionContext", "MockTracker", "mock"].sort();
      equal(Object.keys(api).sort(), names);
      equal(Object.keys(namespace).sort(), [...names, "default"].sort());
      for (const name of names)
        same((api as any)[name], (namespace as any)[name]);
      same(api.mock instanceof api.MockTracker, true);
      equal(
        Object.getOwnPropertyNames(api.MockTracker.prototype).sort(),
        [
          "constructor",
          "fn",
          "method",
          "getter",
          "setter",
          "reset",
          "restoreAll",
        ].sort(),
      );
      equal(
        Object.getOwnPropertyNames(api.MockFunctionContext.prototype).sort(),
        [
          "constructor",
          "calls",
          "callCount",
          "mockImplementation",
          "mockImplementationOnce",
          "restore",
          "resetCalls",
        ].sort(),
      );
    },
    fn(api) {
      const t = tracker(api);
      const owner = { value: 4 };
      const f = t.fn(function (this: typeof owner, a: number, b: number) {
        return this.value + a + b;
      });
      same(f.call(owner, 2, 3), 9);
      same(f.mock.callCount(), 1);
      same(f.mock.calls[0].this, owner);
      equal(f.mock.calls[0].arguments, [2, 3]);
      same(f.mock.calls[0].result, 9);
    },
    overloads(api) {
      const t = tracker(api);
      for (const f of [
        t.fn(),
        t.fn({ times: 2 }),
        t.fn(() => 7, { times: 2 }),
      ]) {
        const result = f();
        same(f.mock.callCount(), 1);
        same(result === 7 || result === undefined, true);
      }
      const original = () => 1;
      const mock = t.fn(original, () => 2);
      same(mock(), 2);
      mock.mock.restore();
      same(mock(), 1);
    },
    calls(api) {
      const f = tracker(api).fn((value: number) => value * 2);
      f(3);
      const first = f.mock.calls;
      same(first === f.mock.calls, false);
      equal(
        Object.keys(first[0]).sort(),
        ["arguments", "error", "result", "stack", "target", "this"].sort(),
      );
      same(Object.getPrototypeOf(first[0]), null);
      same(first[0].stack instanceof Error, true);
      same(first[0].target, undefined);
      same(first[0].error, undefined);
      first.length = 0;
      same(f.mock.callCount(), 1);
      f.mock.resetCalls();
      same(f.mock.callCount(), 0);
      f(4);
      same(f.mock.calls[0].result, 8);
    },
    implementation(api) {
      const f = tracker(api).fn(() => 1);
      same(f(), 1);
      f.mock.mockImplementation(() => 2);
      same(f(), 2);
      failure(() => f.mock.mockImplementation(null), "ERR_INVALID_ARG_TYPE");
      f.mock.restore();
      same(f(), 1);
    },
    once(api) {
      const f = tracker(api).fn(() => 1);
      f.mock.mockImplementationOnce(() => 2);
      f.mock.mockImplementationOnce(() => 4, 2);
      equal([f(), f(), f(), f()], [2, 1, 4, 1]);
      failure(
        () => f.mock.mockImplementationOnce(() => 1, 0),
        "ERR_OUT_OF_RANGE",
      );
      failure(
        () => f.mock.mockImplementationOnce(null),
        "ERR_INVALID_ARG_TYPE",
      );
    },
    times(api) {
      const t = tracker(api);
      const f = t.fn(
        () => 1,
        () => 2,
        { times: 2 },
      );
      equal([f(), f(), f()], [2, 2, 1]);
      const owner = { method: () => 1 };
      const original = owner.method;
      const mock = t.method(owner, "method", () => 2, { times: 1 });
      same(owner.method(), 2);
      same(owner.method, original);
      same(mock.mock.callCount(), 1);
    },
    method(api) {
      const t = tracker(api);
      const original = function (this: any, a: number) {
        return this.value + a;
      };
      const parent = { method: original };
      const owner = Object.create(parent);
      owner.value = 2;
      const f = t.method(owner, "method");
      same(owner.method(3), 5);
      same(f.mock.calls[0].this, owner);
      same(Object.hasOwn(owner, "method"), true);
      f.mock.restore();
      same(owner.method, original);
      same(Object.hasOwn(owner, "method"), true);
      same(Object.getOwnPropertyDescriptor(owner, "method")!.enumerable, true);
    },
    accessors(api) {
      const t = tracker(api);
      let value = 1;
      const owner = {
        get value() {
          return value;
        },
        set value(next: number) {
          value = next;
        },
      };
      const original = Object.getOwnPropertyDescriptor(owner, "value")!;
      const get = t.getter(owner, "value", () => 9);
      same(owner.value, 9);
      same(get.mock.callCount(), 1);
      get.mock.restore();
      same(owner.value, 1);
      const set = t.setter(owner, "value", (next: number) => {
        value = next + 1;
      });
      owner.value = 4;
      same(value, 5);
      equal(set.mock.calls[0].arguments, [4]);
      set.mock.restore();
      same(Object.getOwnPropertyDescriptor(owner, "value")!.get, original.get);
      same(Object.getOwnPropertyDescriptor(owner, "value")!.set, original.set);
    },
    restoration(api) {
      const t = tracker(api);
      const a = { f: () => 1 },
        b = { f: () => 2 };
      const first = a.f,
        second = b.f;
      t.method(a, "f", () => 3);
      t.method(b, "f", () => 4);
      t.restoreAll();
      same(a.f, first);
      same(b.f, second);
      t.reset();
      a.f = () => 9;
      t.restoreAll();
      same(a.f(), 9);
    },
    construct(api) {
      const t = tracker(api);
      function Original(this: any, value: number) {
        this.value = value;
      }
      const mocked = t.fn(Original);
      const value = new mocked(7);
      same(value instanceof Original, true);
      same(value.value, 7);
      const call = mocked.mock.calls[0];
      same(call.target, Original);
      same(call.this, value);
      same(call.result, value);
      equal(call.arguments, [7]);
    },
    errors(api) {
      const marker = {};
      const f = tracker(api).fn(() => {
        throw marker;
      });
      try {
        f();
        throw Error("did not throw");
      } catch (e) {
        same(e, marker);
      }
      same(f.mock.calls[0].error, marker);
      same(f.mock.calls[0].result, undefined);
      const promise = Promise.resolve(3);
      const g = tracker(api).fn(() => promise);
      same(g(), promise);
      same(g.mock.calls[0].result, promise);
    },
    validation(api) {
      const t = tracker(api);
      for (const args of [
        [null],
        [1],
        [() => {}, null],
        [() => {}, () => {}, null],
      ])
        failure(() => t.fn(...args), "ERR_INVALID_ARG_TYPE");
      for (const times of [0, -1, 1.5, NaN])
        failure(() => t.fn({ times }), "ERR_OUT_OF_RANGE");
      failure(() => t.fn({ times: "1" }), "ERR_INVALID_ARG_TYPE");
      failure(() => t.method({}, 1), "ERR_INVALID_ARG_TYPE");
      failure(() => t.method(null, "f"), "ERR_INVALID_ARG_TYPE");
      failure(() => t.method({}, "missing"), "ERR_INVALID_ARG_VALUE");
      const owner = { f() {} };
      failure(
        () => t.method(owner, "f", { getter: true, setter: true }),
        "ERR_INVALID_ARG_VALUE",
      );
      failure(
        () => t.method(owner, "f", { getter: 1 }),
        "ERR_INVALID_ARG_TYPE",
      );
      failure(
        () => t.getter(owner, "f", { getter: false }),
        "ERR_INVALID_ARG_VALUE",
      );
      failure(
        () => t.setter(owner, "f", { setter: false }),
        "ERR_INVALID_ARG_VALUE",
      );
    },
    context(api) {
      const context = new (api.MockFunctionContext as any)(
        () => 1,
        { original: () => 2 },
        Infinity,
      );
      same(context.callCount(), 0);
      equal(context.calls, []);
      same(
        context.mockImplementation(() => 3),
        undefined,
      );
      same(context.resetCalls(), undefined);
      same(context.restore(), undefined);
      const t = tracker(api);
      const key = Symbol("method");
      const owner = { [key]: () => 1 };
      const f = t.method(owner, key, () => 2);
      same(owner[key](), 2);
      f.mock.restore(); // Pinned Workers treats symbol-named restore as a bare-function restore.
      same(owner[key], f);
      try {
        owner[key]();
        throw Error("did not throw");
      } catch (e) {
        same(e instanceof TypeError, true);
      }
      same(f.mock.calls.length, 2);
    },
  },
};
export class TestImplementation extends FeatureImplementation<
  typeof testFeature
> {
  constructor() {
    super(testFeature, {
      exports: { status: "supported" },
      fn: { status: "supported" },
      overloads: { status: "supported" },
      calls: { status: "supported" },
      implementation: { status: "supported" },
      once: { status: "supported" },
      times: { status: "supported" },
      method: { status: "supported" },
      accessors: { status: "supported" },
      restoration: { status: "supported" },
      construct: { status: "supported" },
      errors: { status: "supported" },
      validation: { status: "supported" },
      context: { status: "supported" },
    });
  }
  create() {
    return actual as unknown as Api;
  }
}

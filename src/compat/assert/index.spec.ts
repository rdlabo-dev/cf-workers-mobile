import * as builtin from "node:assert";
import * as strictBuiltin from "node:assert/strict";
import {
  defineFeature,
  FeatureImplementation,
} from "@rdlabo/workers-capacitor/shared/contracts";
import type { ContractSuite } from "@rdlabo/workers-capacitor/shared/contracts/testing";
const api = builtin as unknown as typeof import("./index.js");
function same(a: unknown, b: unknown) {
  if (a !== b) throw Error(`${String(a)} != ${String(b)}`);
}
function equal(a: unknown, b: unknown) {
  same(JSON.stringify(a), JSON.stringify(b));
}
function caught(fn: () => unknown): any {
  try {
    fn();
  } catch (e) {
    return e;
  }
  throw Error("Expected an error");
}
function fails(fn: () => unknown, operator: string) {
  const error = caught(fn);
  same(error.code, "ERR_ASSERTION");
  same(error.name, "AssertionError");
  same(error.operator, operator);
  return error;
}
export const assertFeature = defineFeature<typeof api>()("node.assert", [
  "surface",
  "ok",
  "equality",
  "deepObjects",
  "collections",
  "binary",
  "boxed",
  "cycles",
  "partial",
  "throws",
  "rejects",
  "doesNot",
  "patterns",
  "errors",
  "validation",
] as const);
export const assertContract: ContractSuite<typeof assertFeature> = {
  feature: assertFeature,
  cases: {
    surface(api) {
      const names = [
        "AssertionError",
        "deepEqual",
        "deepStrictEqual",
        "doesNotMatch",
        "doesNotReject",
        "doesNotThrow",
        "equal",
        "fail",
        "ifError",
        "match",
        "notDeepEqual",
        "notDeepStrictEqual",
        "notEqual",
        "notStrictEqual",
        "ok",
        "partialDeepStrictEqual",
        "rejects",
        "strict",
        "strictEqual",
        "throws",
      ];
      equal(Object.keys(api).sort(), [...names, "default"].sort());
      for (const name of names)
        same((api as any)[name], (api.default as any)[name]);
      same(api.default, strictBuiltin.default);
      for (const name of names)
        same((api as any)[name], (strictBuiltin as any)[name]);
      same((api.strict as any).equal, api.strictEqual);
      same((api.strict as any).deepEqual, api.deepStrictEqual);
    },
    ok(api: typeof import("./index.js")) {
      for (const value of [true, 1, "x", {}, []]) {
        (api.default as (value: unknown) => void)(value);
        api.ok(value);
        api.strict(value);
      }
      for (const value of [false, 0, "", null, undefined, NaN])
        fails(() => api.ok(value), "==");
      const e = caught(() => (api.ok as any)());
      same(e.message, "No value argument passed to `assert.ok()`");
      const sentinel = new Error("sentinel");
      same(
        fails(() => api.ok(false, sentinel), "==").message,
        "Error: sentinel",
      );
    },
    equality(api) {
      api.equal(1, 1);
      fails(() => api.equal(1, "1"), "strictEqual");
      api.notEqual(1, 2);
      api.strictEqual(NaN, NaN);
      fails(() => api.strictEqual(0, -0), "strictEqual");
      fails(() => api.equal(1, 2), "strictEqual");
      api.notEqual(1, "1");
      fails(() => api.notEqual(1, 1), "notStrictEqual");
      fails(() => api.notStrictEqual(NaN, NaN), "notStrictEqual");
      api.notStrictEqual(0, -0);
    },
    deepObjects(api) {
      api.deepStrictEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] });
      fails(() => api.deepEqual({ a: 1 }, { a: "1" }), "deepStrictEqual");
      fails(
        () => api.deepStrictEqual(Object.create(null), {}),
        "deepStrictEqual",
      );
      const key = Symbol("key");
      api.deepStrictEqual({ [key]: 1 }, { [key]: 1 });
      fails(() => api.deepStrictEqual({ [key]: 1 }, {}), "deepStrictEqual");
      fails(() => api.notDeepEqual({ a: 1 }, { a: 1 }), "notDeepStrictEqual");
      api.notDeepStrictEqual([, 1], [undefined, 1]);
    },
    collections(api) {
      api.deepStrictEqual(new Set([{ x: 1 }, 2]), new Set([2, { x: 1 }]));
      api.deepStrictEqual(
        new Map([[{ x: 1 }, { y: 2 }]]),
        new Map([[{ x: 1 }, { y: 2 }]]),
      );
      fails(
        () => api.deepStrictEqual(new Set([1]), new Set(["1"])),
        "deepStrictEqual",
      );
      api.deepStrictEqual(new Date(1), new Date(1));
      fails(
        () => api.deepStrictEqual(new Date(1), new Date(2)),
        "deepStrictEqual",
      );
      api.deepStrictEqual(/abc/gi, /abc/gi);
      const re = /abc/g;
      re.lastIndex = 1;
      fails(() => api.deepStrictEqual(re, /abc/g), "deepStrictEqual");
    },
    binary(api) {
      api.deepStrictEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2]));
      fails(
        () => api.deepStrictEqual(new Uint8Array([1]), new Uint8Array([2])),
        "deepStrictEqual",
      );
      api.deepStrictEqual(new Float32Array([NaN]), new Float32Array([NaN]));
      fails(
        () =>
          api.deepStrictEqual(new Float32Array([0]), new Float32Array([-0])),
        "deepStrictEqual",
      );
      api.deepStrictEqual(
        new Uint8Array([1]).buffer,
        new Uint8Array([1]).buffer,
      );
      fails(
        () =>
          api.deepStrictEqual(
            new Uint8Array([1]).buffer,
            new Uint8Array([2]).buffer,
          ),
        "deepStrictEqual",
      );
      api.deepStrictEqual(
        new DataView(new Uint8Array([1]).buffer),
        new DataView(new Uint8Array([1]).buffer),
      );
    },
    boxed(api) {
      for (const value of [1, NaN, "x", true, 1n, Symbol.for("assert")])
        api.deepStrictEqual(Object(value), Object(value));
      for (const pair of [
        [1, 2],
        [true, false],
        ["x", "y"],
        [1n, 2n],
      ])
        fails(
          () => api.deepStrictEqual(Object(pair[0]), Object(pair[1])),
          "deepStrictEqual",
        );
      api.deepStrictEqual(new Error("x"), new Error("x"));
      fails(
        () => api.deepStrictEqual(new Error("x"), new Error("y")),
        "deepStrictEqual",
      );
    },
    cycles(api) {
      const a: any = { value: 1 },
        b: any = { value: 1 };
      a.self = a;
      b.self = b;
      api.deepStrictEqual(a, b);
      b.value = 2;
      fails(
        () => api.deepStrictEqual(a, b, "cycles differ"),
        "deepStrictEqual",
      );
      const x = new Map();
      const y = new Map();
      x.set("self", x);
      y.set("self", y);
      api.deepStrictEqual(x, y);
    },
    partial(api) {
      api.partialDeepStrictEqual({ a: 1, b: { c: 2, d: 3 } }, { b: { c: 2 } });
      api.partialDeepStrictEqual([1, 2, 3], [1, , 3]);
      fails(
        () => api.partialDeepStrictEqual([1, 2, 3], [1, 3]),
        "partialDeepStrictEqual",
      );
      fails(
        () => api.partialDeepStrictEqual({ a: 1 }, { a: 2 }),
        "partialDeepStrictEqual",
      );
    },
    throws(api) {
      api.throws(() => {
        throw new TypeError("bad");
      }, TypeError);
      api.throws(() => {
        throw new Error("bad");
      }, /bad/);
      api.throws(
        () => {
          throw Object.assign(new Error("bad"), { code: "X" });
        },
        { code: "X", message: /bad/ } as any,
      );
      api.throws(
        () => {
          throw 42;
        },
        (value: unknown) => value === 42,
      );
      fails(() => api.throws(() => {}, /bad/), "throws");
      const sentinel = new Error("different");
      const mismatch = fails(
        () =>
          api.throws(() => {
            throw sentinel;
          }, TypeError),
        "throws",
      );
      same(mismatch.actual, sentinel);
    },
    async rejects(api) {
      await api.rejects(Promise.reject(new TypeError("bad")), TypeError);
      await api.rejects(async () => {
        throw new Error("bad");
      }, /bad/);
      const sentinel = new Error("different");
      try {
        await api.rejects(Promise.reject(sentinel), TypeError);
      } catch (error) {
        same((error as any).code, "ERR_ASSERTION");
        same((error as any).actual, sentinel);
        return;
      }
      throw Error("Expected rejection");
    },
    async doesNot(api) {
      api.doesNotThrow(() => {});
      await api.doesNotReject(Promise.resolve(1));
      await api.doesNotReject(async () => 1);
      fails(
        () =>
          api.doesNotThrow(() => {
            throw new Error("bad");
          }),
        "doesNotThrow",
      );
      try {
        await api.doesNotReject(Promise.reject(new Error("bad")));
      } catch (e: any) {
        same(e.code, "ERR_ASSERTION");
        same(e.operator, "doesNotReject");
        return;
      }
      throw Error("Expected rejection");
    },
    patterns(api) {
      api.match("abc", /b/);
      api.doesNotMatch("abc", /z/);
      fails(() => api.match("abc", /z/), "match");
      fails(() => api.doesNotMatch("abc", /b/), "doesNotMatch");
      api.ifError(null);
      api.ifError(undefined);
      fails(() => api.ifError(new Error("bad")), "ifError");
    },
    errors(api) {
      const e = fails(() => api.strictEqual(1, 2), "strictEqual");
      same(e.actual, 1);
      same(e.expected, 2);
      same(e.generatedMessage, false);
      same(e instanceof api.AssertionError, true);
      same(
        e.message,
        "Values are not strictly equal:\n\n\n[Diff] Actual / Expected\n\n\n-   1\n+   2\n",
      );
      same(e.toString(), `AssertionError [ERR_ASSERTION]: ${e.message}`);
      const objectDiff = fails(
        () => api.deepStrictEqual({ b: 2, a: 1 }, { b: 3, a: 1 }),
        "deepStrictEqual",
      );
      same(
        objectDiff.message,
        "Expected values to be strictly deep-equal:\n+ actual - expected\n\n+ { a: 1, b: 2 }\n- { a: 1, b: 3 }\n             ^",
      );
      const explicit = fails(
        () => api.deepStrictEqual({ a: 1 }, { a: 2 }, "different"),
        "deepStrictEqual",
      );
      same(explicit.message, "different");
      same(explicit.generatedMessage, false);
      const fail = caught(() => api.fail("failed"));
      same(fail.code, "ERR_ASSERTION");
      same(fail.message, "failed");
    },
    validation(api) {
      same(
        caught(() => (api.deepStrictEqual as any)(1)).code,
        "ERR_MISSING_ARGS",
      );
      same(caught(() => (api.strictEqual as any)(1)).code, "ERR_MISSING_ARGS");
      same(caught(() => api.throws(1 as any)).code, "ERR_INVALID_ARG_TYPE");
      same(
        caught(() => api.match("x", "x" as any)).code,
        "ERR_INVALID_ARG_TYPE",
      );
    },
  },
};
export class AssertImplementation extends FeatureImplementation<
  typeof assertFeature
> {
  constructor() {
    super(assertFeature, {
      surface: { status: "supported" },
      ok: { status: "supported" },
      equality: { status: "supported" },
      deepObjects: { status: "supported" },
      collections: { status: "supported" },
      binary: { status: "supported" },
      boxed: { status: "supported" },
      cycles: { status: "supported" },
      partial: { status: "supported" },
      throws: { status: "supported" },
      rejects: { status: "supported" },
      doesNot: { status: "supported" },
      patterns: { status: "supported" },
      errors: { status: "supported" },
      validation: { status: "supported" },
    });
  }
  create() {
    return api;
  }
}

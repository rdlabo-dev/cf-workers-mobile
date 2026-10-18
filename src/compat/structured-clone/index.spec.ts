import {
  defineFeature,
  FeatureImplementation,
} from "@rdlabo/capacitor-workers/features";
import type { ContractSuite } from "@rdlabo/capacitor-workers/testing";
import { Headers } from "../headers/index.js";
import { Request } from "../request/index.js";
import { Response } from "../response/index.js";
import { structuredClone } from "./index.js";

type Clone = typeof globalThis.structuredClone;
interface StructuredCloneApi {
  structuredClone: Clone;
  Headers: typeof Headers;
  Request: typeof Request;
  Response: typeof Response;
}
const json = (value: unknown) =>
  JSON.stringify(value, (_key, item) =>
    typeof item === "bigint" ? `${item}n` : item,
  );
const equal = (actual: unknown, expected: unknown) => {
  if (json(actual) !== json(expected))
    throw new Error(`${json(actual)} != ${json(expected)}`);
};
function failure(fn: () => unknown, name: string, message?: string) {
  try {
    fn();
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === name &&
      (message === undefined || error.message === message)
    )
      return;
    throw error;
  }
  throw new Error(`Expected ${name}`);
}

export const structuredCloneFeature = defineFeature<StructuredCloneApi>()(
  "web.structured-clone",
  [
    "api",
    "graphs",
    "collections",
    "builtins",
    "transfer",
    "errors",
    "invalidValues",
    "unsupportedObjects",
    "headers",
    "request",
    "response",
  ],
);
export const structuredCloneContract: ContractSuite<
  typeof structuredCloneFeature
> = {
  feature: structuredCloneFeature,
  cases: {
    api(api) {
      equal(api.structuredClone.name, "structuredClone");
      equal(api.structuredClone.length, 0);
      failure(
        () => Reflect.apply(api.structuredClone, globalThis, []),
        "TypeError",
        "Failed to execute 'structuredClone' on 'ServiceWorkerGlobalScope': parameter 1 is not of type 'Value'.",
      );
      equal(api.structuredClone({ x: 1 }, null as never), { x: 1 });
      for (const options of [false, 1, "x"])
        failure(
          () => api.structuredClone(1, options as never),
          "TypeError",
          "Failed to execute 'structuredClone' on 'ServiceWorkerGlobalScope': parameter 2 is not of type 'StructuredCloneOptions'.",
        );
    },
    graphs(api) {
      const markerLike = {
        __capacitor_workers_clone__: 0,
        headers: "user data",
      };
      equal(api.structuredClone(markerLike), markerLike);
      failure(
        () => api.structuredClone(Object(Symbol("x"))),
        "DataCloneError",
        "[object Symbol] could not be cloned.",
      );
      equal(api.structuredClone({ x: 1, [Symbol.toStringTag]: "URL" }), {
        x: 1,
      });
      equal(
        api.structuredClone({
          x: 1,
          get [Symbol.toStringTag]() {
            throw new Error("must not read");
          },
        }),
        { x: 1 },
      );
      const sparse = api.structuredClone(new Array(3));
      equal([sparse.length, Object.keys(sparse)], [3, []]);
      const ownProto = api.structuredClone(
        JSON.parse('{"__proto__":{"polluted":true}}'),
      );
      equal(Object.hasOwn(ownProto, "__proto__"), true);
      equal(Object.getPrototypeOf(ownProto) === Object.prototype, true);
      equal(ownProto.polluted, undefined);
      const shared = { value: 1 };
      const input: {
        first: typeof shared;
        second: typeof shared;
        self?: unknown;
      } = { first: shared, second: shared };
      input.self = input;
      const copy = api.structuredClone(input);
      equal(copy !== input, true);
      equal(copy.first === copy.second, true);
      equal(copy.self === copy, true);
      class Value {
        x = 1;
      }
      const object = api.structuredClone(new Value());
      equal(Object.getPrototypeOf(object) === Object.prototype, true);
      equal(object, { x: 1 });
      let reads = 0;
      const getter = api.structuredClone({
        get x() {
          reads++;
          return 1;
        },
      });
      equal({ getter, reads }, { getter: { x: 1 }, reads: 1 });
      const symbol = Symbol("ignored");
      equal(api.structuredClone({ x: 1, [symbol]: 2 }), { x: 1 });
    },
    collections(api) {
      const mutableMap = new Map<string, unknown>();
      mutableMap.set("a", {
        get x() {
          mutableMap.clear();
          return "hit";
        },
      });
      mutableMap.set("b", 2);
      equal(
        [...api.structuredClone(mutableMap)],
        [
          ["a", { x: "hit" }],
          ["b", 2],
        ],
      );
      const mutableSet = new Set<unknown>();
      mutableSet.add({
        get x() {
          mutableSet.clear();
          return "hit";
        },
      });
      mutableSet.add("b");
      equal([...api.structuredClone(mutableSet)], [{ x: "hit" }, "b"]);

      const actualMap = new Map([["real", 1]]);
      actualMap[Symbol.iterator] = function* () {
        yield ["fake", 2];
        return undefined;
      };
      equal([...api.structuredClone(actualMap)], [["real", 1]]);
      const actualSet = new Set([1]);
      actualSet[Symbol.iterator] = function* () {
        yield 2;
        return undefined;
      };
      equal([...api.structuredClone(actualSet)], [1]);
      const key = { x: 1 };
      const copy = api.structuredClone({
        map: new Map([[key, { key }]]),
        set: new Set([key]),
      });
      const clonedKey = [...copy.map.keys()][0]!;
      equal(copy.map instanceof Map, true);
      equal(copy.set instanceof Set, true);
      equal(copy.map.get(clonedKey)!.key === clonedKey, true);
      equal([...copy.set][0] === clonedKey, true);
    },
    async builtins(api) {
      const date = new Date(0);
      const snapshot = api.structuredClone({
        date,
        get later() {
          date.setTime(1000);
          return 1;
        },
      });
      equal(+snapshot.date, 0);
      for (const boxed of [
        new Number(3),
        new Boolean(true),
        new String("x"),
        Object(2n),
      ]) {
        const copy = api.structuredClone(boxed);
        equal(
          Object.prototype.toString.call(copy),
          Object.prototype.toString.call(boxed),
        );
        equal(copy.valueOf(), boxed.valueOf());
      }
      const regexp = /a/gi;
      regexp.lastIndex = 2;
      const copy = api.structuredClone({
        date: new Date(123),
        regexp,
        blob: new Blob(["x"], { type: "text/plain" }),
        bigint: 123n,
        view: new Uint16Array([1, 2]),
      });
      equal([copy.date instanceof Date, +copy.date], [true, 123]);
      equal(
        [
          copy.regexp instanceof RegExp,
          copy.regexp.source,
          copy.regexp.flags,
          copy.regexp.lastIndex,
        ],
        [true, "a", "gi", 0],
      );
      equal(
        [copy.blob instanceof Blob, copy.blob.type, await copy.blob.text()],
        [true, "text/plain", "x"],
      );
      equal(copy.bigint, 123n);
      equal([copy.view instanceof Uint16Array, [...copy.view]], [true, [1, 2]]);
    },
    transfer(api) {
      const spoofed = new Uint8Array([1, 2]);
      Object.defineProperty(spoofed, "buffer", {
        get() {
          throw new Error("must not read");
        },
      });
      equal([...api.structuredClone(spoofed)], [1, 2]);
      const float16 = (
        globalThis as unknown as { Float16Array?: typeof Float32Array }
      ).Float16Array;
      if (float16) {
        const value = new float16([1.5, -2]);
        const copy = api.structuredClone(value);
        equal(copy instanceof float16, true);
        equal([...copy], [1.5, -2]);
      }

      for (const transfer of [false, true])
        for (const viewFirst of [false, true]) {
          const buffer = new Uint8Array([1, 2, 3]).buffer;
          const view = new Uint8Array(buffer, 1, 2);
          const input = viewFirst ? { view, buffer } : { buffer, view };
          Object.defineProperty(input, "later", {
            enumerable: true,
            get() {
              new Uint8Array(buffer)[1] = 9;
              return 1;
            },
          });
          const copy = api.structuredClone(input, {
            transfer: transfer ? [buffer] : [],
          });
          equal(
            [...new Uint8Array(copy.buffer)],
            transfer ? [1, 9, 3] : [1, 2, 3],
          );
          equal(copy.view.buffer === copy.buffer, true);
          equal([...copy.view], transfer ? [9, 3] : [2, 3]);
          equal(buffer.byteLength, transfer ? 0 : 3);
        }

      const buffer = new ArrayBuffer(4);
      const view = new Uint8Array(buffer, 1, 2);
      view[0] = 7;
      const copy = api.structuredClone(
        { buffer, view },
        { transfer: [view as never, buffer, buffer] },
      );
      equal(buffer.byteLength, 0);
      equal(view.byteLength, 0);
      equal(copy.buffer.byteLength, 4);
      equal(copy.view.buffer === copy.buffer, true);
      equal([copy.view.byteOffset, copy.view[0]], [1, 7]);
      const unreachable = new ArrayBuffer(1);
      api.structuredClone({}, { transfer: [unreachable] });
      equal(unreachable.byteLength, 0);
      failure(
        () => api.structuredClone({}, { transfer: null as never }),
        "TypeError",
        "Incorrect type for the 'transfer' field on 'StructuredCloneOptions': the provided value is not of type 'Array'.",
      );
      failure(
        () => api.structuredClone({}, { transfer: new Set() as never }),
        "TypeError",
        "Incorrect type for the 'transfer' field on 'StructuredCloneOptions': the provided value is not of type 'Array'.",
      );
      failure(
        () => api.structuredClone({}, { transfer: [{} as never] }),
        "TypeError",
        "Object is not transferable",
      );
      failure(
        () => api.structuredClone(buffer),
        "DataCloneError",
        "An ArrayBuffer is detached and could not be cloned.",
      );
    },
    errors(api) {
      const cause = { nested: 1 };
      const original = new TypeError("broken", { cause });
      (original as TypeError & { extra: unknown }).extra = { value: 2 };
      const copy = api.structuredClone(original) as TypeError & {
        cause: typeof cause;
        extra: { value: number };
      };
      equal(copy instanceof TypeError, true);
      equal([copy.name, copy.message], ["TypeError", "broken"]);
      equal(copy.cause, cause);
      equal(copy.cause !== cause, true);
      equal(copy.extra, { value: 2 });
      equal(Object.keys(copy).includes("stack"), true);
      const aggregate = api.structuredClone(
        new AggregateError([new Error("inner"), { x: 1 }], "all", {
          cause: "why",
        }),
      );
      equal(aggregate instanceof AggregateError, true);
      equal(
        [aggregate.name, aggregate.message, aggregate.cause],
        ["AggregateError", "all", "why"],
      );
      equal(
        aggregate.errors.map((item) =>
          item instanceof Error ? [item.name, item.message] : item,
        ),
        [["Error", "inner"], { x: 1 }],
      );
      equal(Object.keys(aggregate).includes("errors"), true);
      const dom = api.structuredClone(new DOMException("gone", "AbortError"));
      equal(dom instanceof DOMException, true);
      equal([dom.code, dom.name, dom.message], [20, "AbortError", "gone"]);
      equal(Object.keys(dom), ["code", "name", "message", "stack"]);
    },
    invalidValues(api) {
      for (const value of [Symbol("x"), () => {}])
        failure(() => api.structuredClone(value), "DataCloneError");
      for (const value of [new WeakMap(), new WeakSet(), Promise.resolve()])
        failure(() => api.structuredClone(value), "DataCloneError");
    },
    unsupportedObjects(api) {
      for (const [value, type] of [
        [new URL("https://a/"), "URL"],
        [new URLSearchParams("a=1"), "URLSearchParams"],
        [new TextEncoder(), "TextEncoder"],
        [new TextDecoder(), "TextDecoder"],
        [new AbortController(), "AbortController"],
      ] as const)
        failure(
          () => api.structuredClone(value),
          "DataCloneError",
          `Could not serialize object of type "${type}". This type does not support serialization.`,
        );
      failure(
        () => api.structuredClone(new AbortController().signal),
        "DataCloneError",
        "AbortSignal serialization is not enabled.",
      );
      failure(
        () => api.structuredClone(new ReadableStream()),
        "DataCloneError",
        "ReadableStream can only be serialized for RPC.",
      );
    },
    headers(api) {
      const snapshot = new api.Headers({ x: "before" });
      const copied = api.structuredClone({
        snapshot,
        get later() {
          snapshot.set("x", "after");
          return 1;
        },
      });
      equal(copied.snapshot.get("x"), "before");
      const headers = new api.Headers([
        ["Ä", "upper"],
        ["ä", "lower"],
        ["set-cookie", "a=1"],
        ["set-cookie", "b=2"],
      ]);
      const graph = api.structuredClone({ first: headers, second: headers });
      equal(graph.first instanceof api.Headers, true);
      equal(graph.first === graph.second, true);
      equal(graph.first.get("Ä"), "upper");
      equal(graph.first.get("ä"), "lower");
      equal(graph.first.getAll("set-cookie"), ["a=1", "b=2"]);
      headers.set("Ä", "changed");
      equal(graph.first.get("Ä"), "upper");
      const immutable = api.Response.redirect("https://a/").headers;
      const immutableCopy = api.structuredClone(immutable);
      failure(() => immutableCopy.set("x", "a"), "TypeError");
    },
    request(api) {
      let calls = 0;
      class Subclass extends api.Request {
        get cf() {
          calls++;
          return { wrong: true };
        }
      }
      const internal = api.structuredClone(
        new Subclass("https://a/", { cf: { original: true } }),
      );
      equal(calls, 0);
      equal(internal.cf, { original: true });
      const cyclic = new api.Request("https://a/", { cf: {} });
      cyclic.cf!.self = cyclic;
      const transfer = new ArrayBuffer(4);
      failure(
        () =>
          api.structuredClone({ cyclic, transfer }, { transfer: [transfer] }),
        "Error",
        "Unable to deserialize cloned data.",
      );
      equal(transfer.byteLength, 0);
      const request = new api.Request("https://a.test/path", {
        method: "POST",
        headers: { x: "a" },
        redirect: "manual",
        cache: "no-store",
        cf: { nested: { x: 1 } },
      });
      const copy = api.structuredClone(request);
      equal(copy instanceof api.Request, true);
      equal(
        [copy.url, copy.method, copy.redirect, copy.cache, copy.body],
        ["https://a.test/path", "POST", "manual", "no-store", null],
      );
      equal([...copy.headers], [["x", "a"]]);
      equal(copy.cf, { nested: { x: 1 } });
      equal(copy.cf !== request.cf, true);
      equal(copy.signal === request.signal, false);
      failure(
        () =>
          api.structuredClone(
            new api.Request("https://a/", {
              signal: new AbortController().signal,
            }),
          ),
        "DataCloneError",
        "AbortSignal serialization is not enabled.",
      );
      failure(
        () =>
          api.structuredClone(
            new api.Request("https://a/", { method: "POST", body: "x" }),
          ),
        "DataCloneError",
        "ReadableStream can only be serialized for RPC.",
      );
    },
    response(api) {
      const cyclic = new api.Response(null, { cf: {} });
      cyclic.cf!.self = cyclic;
      failure(
        () => api.structuredClone(cyclic),
        "Error",
        "Unable to deserialize cloned data.",
      );
      const response = new api.Response(null, {
        status: 201,
        statusText: "Custom",
        headers: { x: "a" },
        cf: { nested: { x: 1 } },
        encodeBody: "manual",
      });
      const copy = api.structuredClone(response);
      equal(copy instanceof api.Response, true);
      equal(
        [copy.status, copy.statusText, copy.type, copy.url, copy.redirected],
        [201, "Custom", "default", "", false],
      );
      equal([...copy.headers], [["x", "a"]]);
      equal(copy.cf, { nested: { x: 1 } });
      equal(copy.cf !== response.cf, true);
      failure(
        () => api.structuredClone(new api.Response("x")),
        "DataCloneError",
        "ReadableStream can only be serialized for RPC.",
      );
      equal(api.structuredClone(api.Response.error()).type, "error");
    },
  },
};

export class StructuredCloneImplementation extends FeatureImplementation<
  typeof structuredCloneFeature
> {
  constructor(private readonly api: StructuredCloneApi) {
    super(
      structuredCloneFeature,
      Object.fromEntries(
        structuredCloneFeature.cases.map((id) => [id, { status: "supported" }]),
      ) as never,
    );
  }
  create() {
    return this.api;
  }
}

export const localStructuredCloneApi: StructuredCloneApi = {
  structuredClone: structuredClone as Clone,
  Headers,
  Request,
  Response,
};

import {
  defineFeature,
  FeatureImplementation,
} from "workers-capacitor/shared/contracts";
import type { ContractSuite } from "workers-capacitor/shared/contracts/testing";
import * as namespace from "node:util";
// The oracle must use workerd's builtin, never the implementation source.
const util = namespace as unknown as typeof import("./index.js");
function same(a: unknown, b: unknown) {
  if (a !== b) throw Error(`${String(a)} != ${String(b)}`);
}
function equal(a: unknown, b: unknown) {
  same(JSON.stringify(a), JSON.stringify(b));
}
function failure(fn: () => unknown, code?: string, message?: string) {
  try {
    fn();
  } catch (error) {
    if (code) same((error as Error & { code: string }).code, code);
    if (message) same((error as Error).message, message);
    return error;
  }
  throw Error("Expected rejection");
}
export const utilFeature = defineFeature<typeof util>()("node.util", [
  "formatting",
  "inspection",
  "debugging",
  "legacyPredicates",
  "unicode",
  "abortResolution",
  "abortValidation",
  "deepComparison",
  "styling",
  "stylingValidation",
  "mimeConstruction",
  "mimeParameters",
  "mimeIteration",
  "mimeQuoted",
  "mimeMutation",
  "mimeSerialization",
  "mimeValidation",
  "mimeDetached",
  "encoders",
  "polyfill",
  "promisify",
  "customPromisify",
  "callbackify",
  "callbackifyErrors",
  "parseEnv",
  "parseEnvEdges",
  "utilities",
  "unsupported",
] as const);
export const utilContract: ContractSuite<typeof utilFeature> = {
  feature: utilFeature,
  cases: {
    formatting(api) {
      same(
        api.format("%s %d %i %f %j %%", "x", 2, "3px", "4.5px", { a: 1 }),
        'x 2 3 4.5 {"a":1} %',
      );
      same(
        api.formatWithOptions({ sorted: true }, "%O", { b: 2, a: 1 }),
        "{ a: 1, b: 2 }",
      );
      same(api.stripVTControlCharacters("\u001b[31mred\u001b[39m"), "red");
      same(api.default.formatWithOptions, api.formatWithOptions);
      same(api.default.stripVTControlCharacters, api.stripVTControlCharacters);
      failure(
        () => api.stripVTControlCharacters(1 as any),
        "ERR_INVALID_ARG_TYPE",
      );
    },
    inspection(api) {
      same(api.inspect({ b: 2, a: 1 }, { sorted: true }), "{ a: 1, b: 2 }");
      same(api.inspect(new Map([[1, "one"]])), "Map(1) { 1 => 'one' }");
      same(api.inspect(new Set([1, 2])), "Set(2) { 1, 2 }");
      same(api.inspect(new Uint8Array([1, 2])), "Uint8Array(2) [ 1, 2 ]");
      const value: any = {};
      value.self = value;
      same(api.inspect(value), "<ref *1> { self: [Circular *1] }");
      same(
        api.inspect({
          [Symbol.for("nodejs.util.inspect.custom")]: () => "custom",
        }),
        "custom",
      );
      same(api.inspect.custom, Symbol.for("nodejs.util.inspect.custom"));
    },
    debugging(api) {
      same(api.debug, api.debuglog);
      same(api.default.debug, api.debuglog);
      const calls: unknown[][] = [];
      const saved = console.log;
      console.log = (...args: unknown[]) => {
        calls.push(args);
      };
      try {
        let count = 0;
        const logger = api.debuglog("workers-test", () => {
          count++;
        });
        same(logger.enabled, true);
        same(count, 0);
        logger("%s %d", "item", 2);
        logger("again");
        same(count, 1);
        equal(calls, [["WORKERS-TEST: item 2\n"], ["WORKERS-TEST: again\n"]]);
      } finally {
        console.log = saved;
      }
    },
    legacyPredicates(api) {
      same(api.isError(new Error("x")), true);
      same(api.isError({ [Symbol.toStringTag]: "Error" }), false);
      same(api.isPrimitive(1n), true);
      same(api.isPrimitive(Symbol()), true);
      same(
        api.isPrimitive(() => {}),
        false,
      );
      same(
        api.isObject(() => {}),
        false,
      );
      same(api.isObject([]), true);
      same(api.isNullOrUndefined(null), true);
      same(api.isNullOrUndefined(undefined), true);
      same(api.isNullOrUndefined(0), false);
    },
    unicode(api) {
      same(api.toUSVString("x\ud800y\udc00z"), "x\ufffdy\ufffdz");
      same(api.toUSVString("😀"), "😀");
      same(api.toUSVString({ toWellFormed: () => "custom" } as any), "custom");
      failure(() => api.toUSVString(123 as any));
    },
    async abortResolution(api) {
      const controller = new AbortController();
      const pending = api.aborted(controller.signal, {});
      let settled = false;
      pending.then(() => {
        settled = true;
      });
      await Promise.resolve();
      same(settled, false);
      const reason = Error("stop");
      controller.abort(reason);
      const event = await pending;
      same(event?.type, "abort");
      same(event?.target, controller.signal);
      same(await api.aborted(controller.signal, []), undefined);
      same(await api.aborted(controller.signal, () => {}), undefined);
    },
    async abortValidation(api) {
      for (const signal of [undefined, null, 1, "x", {}]) {
        await api.aborted(signal, {}).then(
          () => {
            throw Error("Expected rejection");
          },
          (error) => same(error.code, "ERR_INVALID_ARG_TYPE"),
        );
      }
      for (const resource of [undefined, null, 1, "x"]) {
        await api.aborted(AbortSignal.abort(), resource).then(
          () => {
            throw Error("Expected rejection");
          },
          (error) => same(error.code, "ERR_INVALID_ARG_TYPE"),
        );
      }
    },
    deepComparison(api) {
      same(api.isDeepStrictEqual({ a: [1, 2] }, { a: [1, 2] }), true);
      same(api.isDeepStrictEqual({ a: 1 }, { a: "1" }), false);
      same(api.isDeepStrictEqual(new Set([1, 2]), new Set([2, 1])), true);
      same(api.isDeepStrictEqual(NaN, NaN), true);
      same(api.isDeepStrictEqual(0, -0), false);
      const a: any = {};
      a.self = a;
      const b: any = {};
      b.self = b;
      same(api.isDeepStrictEqual(a, b), true);
    },
    styling(api) {
      same(api.styleText("red", "hello"), "hello");
      same(
        api.styleText("red", "hello", { validateStream: false }),
        "\u001b[31mhello\u001b[39m",
      );
      same(
        api.styleText(["bold", "red"], "hello", { validateStream: false }),
        "\u001b[1m\u001b[31mhello\u001b[39m\u001b[22m",
      );
      same(api.styleText("none", "hello", { validateStream: false }), "hello");
      const stream: any = {
        write() {},
        on() {},
        isTTY: true,
        getColorDepth: () => 2,
      };
      same(
        api.styleText("red", "hello", { stream }),
        "\u001b[31mhello\u001b[39m",
      );
      stream.getColorDepth = () => 8;
      same(api.styleText("red", "hello", { stream }), "hello");
      same(
        api.styleText("red", "hello", { stream: new ReadableStream() }),
        "hello",
      );
    },
    stylingValidation(api) {
      failure(() => api.styleText("red", 1), "ERR_INVALID_ARG_TYPE");
      failure(
        () => api.styleText("red", "x", { validateStream: 1 as any }),
        "ERR_INVALID_ARG_TYPE",
      );
      failure(
        () => api.styleText("red", "x", { stream: {} as any }),
        "ERR_INVALID_ARG_TYPE",
      );
      failure(
        () => api.styleText("invalid-style", "x"),
        "ERR_INVALID_ARG_VALUE",
      );
      for (const method of [
        "_errnoException",
        "_exceptionWithHostPort",
      ] as const)
        failure(
          () => api[method](),
          "ERR_METHOD_NOT_IMPLEMENTED",
          `The ${method} method is not implemented`,
        );
    },
    mimeConstruction(api) {
      same(api.default.MIMEType, api.MIMEType);
      same(api.default.MIMEParams, api.MIMEParams);
      const mime = new api.MIMEType(" \tText/PLAIN \r\n; charset=UTF-8");
      same(mime.type, "text");
      same(mime.subtype, "plain");
      same(mime.essence, "text/plain");
      same(String(mime), "text/plain;charset=UTF-8");
      same(mime.params instanceof api.MIMEParams, true);
      same(mime.params, mime.params);
      same(Object.prototype.toString.call(mime), "[object MIMEType]");
      same(Object.prototype.toString.call(mime.params), "[object MIMEParams]");
      same(new api.MIMEType({ toString: () => "a/b" }).essence, "a/b");
    },
    mimeParameters(api) {
      const mime = new api.MIMEType("a/b;A=1;b=2;c=3;boundary=x");
      const p = mime.params;
      same(p.get("a"), "1");
      same(p.get("A"), null);
      same(p.has("A"), false);
      p.set("A", "changed");
      same(p.get("a"), "1");
      p.delete("A");
      equal(
        [...p],
        [
          ["boundary", "x"],
          ["b", "2"],
          ["c", "3"],
        ],
      );
      p.set("A", "new");
      equal([...p.keys()], ["boundary", "b", "c", "a"]);
      p.delete("missing");
      same(p.get("missing"), null);
    },
    mimeIteration(api) {
      const mime = new api.MIMEType("a/b;a=1;b=2");
      const p = mime.params;
      const entries = p.entries(),
        keys = p.keys(),
        values = p.values(),
        iterator = p[Symbol.iterator]();
      same(Object.prototype.toString.call(entries), "[object EntryIterator]");
      same(Object.prototype.toString.call(keys), "[object KeyIterator]");
      same(Object.prototype.toString.call(values), "[object ValueIterator]");
      same(p[Symbol.iterator] === p.entries, false);
      p.delete("a");
      p.set("c", "3");
      equal(
        [...entries],
        [
          ["a", "1"],
          ["b", "2"],
        ],
      );
      equal([...keys], ["a", "b"]);
      equal([...values], ["1", "2"]);
      equal(
        [...iterator],
        [
          ["a", "1"],
          ["b", "2"],
        ],
      );
      equal(
        [...p],
        [
          ["b", "2"],
          ["c", "3"],
        ],
      );
      same(entries.next().done, true);
    },
    mimeQuoted(api) {
      const mime = new api.MIMEType('a/b;x="a\\"b\\\\c"junk;y="unterminated');
      same(mime.params.get("x"), 'a"b\\c');
      same(mime.params.get("y"), "unterminated");
      same(new api.MIMEType('a/b;x="trailing\\').params.get("x"), "trailing\\");
      const ignored = new api.MIMEType(
        'a/b;invalid;=bad;x=;empty="";bad name=value;ok=yes;control=\u0001',
      );
      equal(
        [...ignored.params],
        [
          ["empty", ""],
          ["ok", "yes"],
        ],
      );
      same(new api.MIMEType('a/b;x="日本語😀"').params.get("x"), "日本語😀");
    },
    mimeMutation(api) {
      const mime = new api.MIMEType("a/b;x=1");
      mime.type = "APPLICATION";
      mime.subtype = "JSON";
      same(String(mime), "application/json;x=1");
      failure(
        () => {
          mime.type = "bad type";
        },
        undefined,
        "Not a valid MIME type",
      );
      failure(
        () => {
          mime.subtype = "";
        },
        undefined,
        "Not a valid MIME subtype",
      );
      same(mime.essence, "application/json");
      const p = mime.params;
      failure(
        () => p.set("bad name", "value"),
        undefined,
        "Not a valid MIME parameter",
      );
      failure(() => p.set("ok", "\r"), undefined, "Not a valid MIME parameter");
      p.set("empty", "");
      same(p.get("empty"), "");
    },
    mimeSerialization(api) {
      const mime = new api.MIMEType("a/b;boundary=123;x=hello world");
      same(mime.toJSON(), 'a/b; boundary=123;x="hello world"');
      same(mime.params.toJSON(), ' boundary=123;x="hello world"');
      same(JSON.stringify(mime), '"a/b; boundary=123;x=\\"hello world\\""');
      mime.params.set("slash", "a\\b");
      same(mime.params.get("slash"), "a\\b");
      same(String(mime).endsWith("slash=a\\b"), true);
      mime.toString = () => "overridden";
      same(mime.toJSON().startsWith("a/b;"), true);
      mime.params.toString = () => "overridden";
      same(mime.params.toJSON().startsWith(" boundary="), true);
    },
    mimeValidation(api) {
      for (const input of ["", "a", "a/", "/b", "a b/c", "a/b/c", "é/b"])
        failure(
          () => new api.MIMEType(input),
          undefined,
          `Not a valid MIME type: ${input}`,
        );
      failure(
        () => new (api.MIMEType as any)(),
        undefined,
        "Failed to construct 'MIMEType': constructor parameter 1 is not of type 'string'.",
      );
      failure(
        () => new api.MIMEType(Symbol("x")),
        undefined,
        "Cannot convert a Symbol value to a string",
      );
      const p = new api.MIMEParams();
      for (const name of ["get", "has", "delete", "set"] as const)
        failure(
          () => (p[name] as any)(),
          undefined,
          `Failed to execute '${name}' on 'MIMEParams': parameter 1 is not of type 'string'.`,
        );
      failure(
        () => (p.set as any)("x"),
        undefined,
        "Failed to execute 'set' on 'MIMEParams': parameter 2 is not of type 'string'.",
      );
      failure(
        () => api.MIMEParams.prototype.get.call({} as any, "x"),
        undefined,
        "Illegal invocation: function called with incorrect `this` reference. See https://developers.cloudflare.com/workers/observability/errors/#illegal-invocation-errors for details.",
      );
      failure(
        () => api.MIMEType.prototype.toJSON.call({} as any),
        undefined,
        "Illegal invocation: function called with incorrect `this` reference. See https://developers.cloudflare.com/workers/observability/errors/#illegal-invocation-errors for details.",
      );
    },
    mimeDetached(api) {
      const p = new api.MIMEParams();
      same(p.set("x", "y"), undefined);
      p.set("invalid name", "\u0001");
      p.delete("x");
      same(p.get("x"), null);
      same(p.has("x"), false);
      same(String(p), "");
      same(p.toJSON(), "");
      equal([...p], []);
      equal([...p.keys()], []);
      equal([...p.values()], []);
    },
    encoders(api) {
      same(
        new api.TextDecoder().decode(new api.TextEncoder().encode("ok😀")),
        "ok😀",
      );
    },
    polyfill(api) {
      for (const name of [
        "promisify",
        "inspect",
        "format",
        "parseEnv",
        "callbackify",
      ] as const) {
        same(typeof api[name], "function");
        same(api.default[name], api[name]);
      }
    },
    async promisify(api) {
      function original(
        this: { base: number },
        value: number,
        cb: (error: unknown, value?: number) => void,
      ) {
        cb(null, this.base + value);
      }
      Object.defineProperty(original, "example", {
        value: 42,
        enumerable: false,
      });
      const wrapped = api.promisify(original);
      same(await wrapped.call({ base: 2 }, 3), 5);
      same(wrapped.name, original.name);
      same(wrapped.length, original.length);
      equal(
        Object.getOwnPropertyDescriptor(wrapped, "example"),
        Object.getOwnPropertyDescriptor(original, "example"),
      );
      same(Object.getPrototypeOf(wrapped), Object.getPrototypeOf(original));
      same(api.promisify(wrapped), wrapped);
      const marker = {};
      try {
        await api.promisify(() => {
          throw marker;
        })();
        throw Error("did not reject");
      } catch (e) {
        same(e, marker);
      }
      try {
        await api.promisify((cb: Function) => cb(marker))();
        throw Error("did not reject");
      } catch (e) {
        same(e, marker);
      }
      failure(() => api.promisify(null as never), "ERR_INVALID_ARG_TYPE");
    },
    async customPromisify(api) {
      const custom = Symbol.for("nodejs.util.promisify.custom");
      same(api.promisify.custom, custom);
      const fn = () => {};
      const replacement = () => 7;
      Object.assign(fn, { [custom]: replacement });
      same(api.promisify(fn), replacement);
      equal(Object.getOwnPropertyDescriptor(replacement, custom), {
        value: replacement,
        writable: false,
        enumerable: false,
        configurable: true,
      });
      Object.assign(fn, { [custom]: 1 });
      failure(() => api.promisify(fn), "ERR_INVALID_ARG_TYPE");
      function multiple(cb: Function) {
        cb(null, 3, "x");
      }
      Object.assign(multiple, {
        [Symbol.for("nodejs.util.promisify.custom.args")]: ["count", "text"],
      });
      equal(await api.promisify(multiple)(), { count: 3, text: "x" });
    },
    async callbackify(api) {
      const receiver = { value: 4 };
      async function original(this: typeof receiver, n: number) {
        return this.value + n;
      }
      const callbackified = api.callbackify(original as any) as Function;
      same(callbackified.name, `${original.name}Callbackified`);
      same(callbackified.length, 2);
      let synchronous = true;
      const result = new Promise<void>((resolve, reject) => {
        const value = callbackified.call(
          receiver,
          3,
          function (this: unknown, error: unknown, value: unknown) {
            try {
              same(this, receiver);
              same(error, null);
              same(value, 7);
              same(synchronous, false);
              resolve();
            } catch (e) {
              reject(e);
            }
          },
        );
        same(value, undefined);
      });
      synchronous = false;
      await result;
    },
    async callbackifyErrors(api) {
      failure(() => api.callbackify(null as never), "ERR_INVALID_ARG_TYPE");
      const wrapped = api.callbackify(async () => 1) as Function;
      failure(() => wrapped(), "ERR_INVALID_ARG_TYPE");
      for (const reason of [null, undefined, false, 0, "", NaN]) {
        await new Promise<void>((resolve, reject) => {
          (
            api.callbackify(async () => {
              throw reason;
            }) as Function
          )((error: any) => {
            try {
              same(error.code, "ERR_FALSY_VALUE_REJECTION");
              same(error.message, "Promise was rejected with falsy value");
              same(Object.is(error.reason, reason), true);
              resolve();
            } catch (e) {
              reject(e);
            }
          });
        });
      }
      const marker = {};
      same(
        failure(() =>
          (
            api.callbackify((() => {
              throw marker;
            }) as any) as Function
          )(() => {}),
        ),
        marker,
      );
    },
    parseEnv(api) {
      equal(
        api.parseEnv(
          "# comment\nexport A = one #tail\nB=\"two\\nlines\"\nC='literal\\n'\nD=`three`\nEMPTY=\nA=last\n",
        ),
        { A: "last", B: "two\nlines", C: "literal\\n", D: "three", EMPTY: "" },
      );
      equal(api.parseEnv('MULTI="first\nsecond" trailing\nNEXT=ok\n'), {
        MULTI: "first\nsecond",
        NEXT: "ok",
      });
      same(Object.getPrototypeOf(api.parseEnv("X=y")), Object.prototype);
    },
    parseEnvEdges(api) {
      for (const value of [null, undefined, 2, {}, new String("A=b")])
        failure(() => api.parseEnv(value as never), "ERR_INVALID_ARG_TYPE");
      equal(api.parseEnv("NO_EQUALS\n =ignored\nA=\"\nB='unclosed\nC=ok\n"), {
        A: '"',
        B: "unclosed",
        C: "ok",
      });
      const parsed = api.parseEnv(
        "__proto__=ignored\nconstructor=value\nX= a=b\r\n",
      );
      same(Object.hasOwn(parsed, "__proto__"), false);
      same(parsed.constructor, "value");
      same(parsed.X, "a=b");
    },
    utilities(api) {
      const fn = () => 1;
      same(api.deprecate(fn, "ignored"), fn);
      same(api.deprecate(null), null);
      const target = {};
      same(api._extend(target, { a: 1 }), target);
      equal(target, { a: 1 });
      const order: string[] = [];
      api._extend(
        {},
        {
          get first() {
            order.push("first");
            return 1;
          },
          get second() {
            order.push("second");
            return 2;
          },
        },
      );
      equal(order, ["second", "first"]);
      function Parent() {}
      function Child() {}
      api.inherits(Child, Parent);
      same(Object.getPrototypeOf(Child.prototype), Parent.prototype);
      equal(Object.getOwnPropertyDescriptor(Child, "super_"), {
        value: Parent,
        writable: true,
        enumerable: false,
        configurable: true,
      });
      failure(() => api.inherits(null, Parent), "ERR_INVALID_ARG_TYPE");
    },
    unsupported(api) {
      for (const name of [
        "parseArgs",
        "transferableAbortController",
        "transferableAbortSignal",
        "getSystemErrorMap",
        "getSystemErrorName",
        "getSystemErrorMessage",
      ] as const) {
        failure(
          () => api[name](),
          undefined,
          `node:util ${name} is not implemented`,
        );
      }
    },
  },
};
export class UtilImplementation extends FeatureImplementation<
  typeof utilFeature
> {
  constructor(private readonly api = util) {
    super(utilFeature, {
      formatting: { status: "supported" },
      inspection: { status: "supported" },
      debugging: { status: "supported" },
      legacyPredicates: { status: "supported" },
      unicode: { status: "supported" },
      abortResolution: { status: "supported" },
      abortValidation: { status: "supported" },
      deepComparison: { status: "supported" },
      styling: { status: "supported" },
      stylingValidation: { status: "supported" },
      mimeConstruction: { status: "supported" },
      mimeParameters: { status: "supported" },
      mimeIteration: { status: "supported" },
      mimeQuoted: { status: "supported" },
      mimeMutation: { status: "supported" },
      mimeSerialization: { status: "supported" },
      mimeValidation: { status: "supported" },
      mimeDetached: { status: "supported" },
      encoders: { status: "supported" },
      polyfill: { status: "supported" },
      promisify: { status: "supported" },
      customPromisify: { status: "supported" },
      callbackify: { status: "supported" },
      callbackifyErrors: { status: "supported" },
      parseEnv: { status: "supported" },
      parseEnvEdges: { status: "supported" },
      utilities: { status: "supported" },
      unsupported: { status: "supported" },
    });
  }
  create() {
    return this.api;
  }
}

import {
  defineFeature,
  FeatureImplementation,
} from "@rdlabo/capacitor-workers/features";
import type { ContractSuite } from "@rdlabo/capacitor-workers/testing";
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

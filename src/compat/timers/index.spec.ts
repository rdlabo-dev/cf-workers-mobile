import { AsyncLocalStorage } from "node:async_hooks";
import * as nodeTimers from "node:timers";
import * as bareTimers from "timers";
import * as nodePromises from "node:timers/promises";
import * as barePromises from "timers/promises";
import {
  defineFeature,
  FeatureImplementation,
} from "@rdlabo/capacitor-workers/features";
import type { ContractSuite } from "@rdlabo/capacitor-workers/testing";
type Api = {
  t: typeof import("./index.js");
  p: typeof import("./promises.js");
};
const operations = [
  "surface",
  "callback",
  "arguments",
  "clear",
  "numeric",
  "refresh",
  "repeat",
  "refs",
  "constructor",
  "receivers",
  "legacy",
  "delay",
  "immediate",
  "immediateCancel",
  "promisesSurface",
  "timeoutPromise",
  "immediatePromise",
  "promiseValidation",
  "preAbort",
  "abort",
  "interval",
  "intervalAbort",
  "intervalCleanup",
  "scheduler",
  "schedulerAbort",
  "schedulerValidation",
  "schedulerUncloneable",
  "schedulerSignalState",
  "globalIdentity",
  "context",
] as const;
function check(value: unknown, message = "assertion failed") {
  if (!value) throw new Error(message);
}
function equal(a: unknown, b: unknown) {
  const json = (value: unknown) =>
    JSON.stringify(value, (_key, item) =>
      item && typeof item === "object" && !Array.isArray(item)
        ? Object.fromEntries(
            Object.keys(item)
              .sort()
              .map((k) => [k, item[k]]),
          )
        : item,
    );
  if (json(a) !== json(b))
    throw new Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`);
}
function error(fn: () => unknown, name: string, code?: string) {
  try {
    fn();
  } catch (e) {
    equal((e as Error).name, name);
    if (code) equal((e as { code?: string }).code, code);
    return e as Error & { code?: string; cause?: unknown };
  }
  throw new Error("expected throw");
}
async function rejected(
  promise: PromiseLike<unknown>,
  name: string,
  code?: string,
) {
  try {
    await promise;
  } catch (e) {
    equal((e as Error).name, name);
    if (code) equal((e as { code?: string }).code, code);
    return e as Error & { code?: string; cause?: unknown };
  }
  throw new Error("expected rejection");
}
export const timersFeature = defineFeature<Api>()("node.timers", operations);
export const timersContract: ContractSuite<typeof timersFeature> = {
  feature: timersFeature,
  cases: {
    surface({ t }) {
      equal(
        Object.keys(t).sort(),
        [
          "Timeout",
          "active",
          "clearImmediate",
          "clearInterval",
          "clearTimeout",
          "default",
          "enroll",
          "promises",
          "setImmediate",
          "setInterval",
          "setTimeout",
          "unenroll",
        ].sort(),
      );
      equal(
        Object.keys(t.default).sort(),
        [
          "active",
          "clearImmediate",
          "clearInterval",
          "clearTimeout",
          "enroll",
          "promises",
          "setImmediate",
          "setInterval",
          "setTimeout",
          "unenroll",
        ].sort(),
      );
      equal(
        Object.getOwnPropertyNames(t.Timeout.prototype).sort(),
        ["constructor", "refresh", "unref", "ref", "hasRef", "close"].sort(),
      );
      for (const key of Object.keys(t.default))
        check(
          t.default[key as keyof typeof t.default] === t[key as keyof typeof t],
        );
      check(
        t.setTimeout === (bareTimers.setTimeout as unknown) &&
          t.Timeout === (bareTimers as unknown as typeof t).Timeout,
      );
    },
    async callback({ t }) {
      let synchronous = true;
      await new Promise<void>((resolve) => {
        const handle = t.setTimeout(function (this: unknown) {
          check(!synchronous);
          check(this === globalThis, "callback receiver");
          resolve();
        }, 0);
        check(handle instanceof t.Timeout);
        synchronous = false;
      });
      for (const bad of [null, undefined, 1, "x", {}])
        error(
          () => t.setTimeout(bad as never),
          "TypeError",
          "ERR_INVALID_ARG_TYPE",
        );
    },
    async arguments({ t }) {
      const marker = {};
      await new Promise<void>((resolve) =>
        t.setTimeout(
          (a, b, c) => {
            check(a === marker);
            equal([b, c], ["x", 3]);
            resolve();
          },
          0,
          marker,
          "x",
          3,
        ),
      );
    },
    async clear({ t, p }) {
      let calls = 0;
      const a = t.setTimeout(() => calls++, 1),
        b = t.setInterval(() => calls++, 1);
      t.clearTimeout(a);
      t.clearInterval(b);
      t.clearTimeout(a);
      t.clearInterval(b);
      for (const input of [undefined, null, {}, "1", false]) {
        t.clearTimeout(input as never);
        t.clearInterval(input as never);
      }
      await p.setTimeout(5);
      equal(calls, 0);
    },
    async numeric({ t, p }) {
      let calls = 0;
      const a = t.setTimeout(() => calls++, 1);
      const id = +a;
      check(typeof id === "number" && Number.isFinite(id));
      equal(Number(a), id);
      t.clearInterval(id);
      await p.setTimeout(5);
      equal(calls, 0);
      const b = t.setTimeout(() => calls++, 1);
      t.clearTimeout(String(+b));
      await p.setTimeout(5);
      equal(calls, 1);
      const c = t.setInterval(() => calls++, 1);
      t.clearTimeout(+c);
      await p.setTimeout(5);
      equal(calls, 1);
    },
    async refresh({ t }) {
      let count = 0;
      await new Promise<void>((resolve) => {
        const h = t.setTimeout(() => {
          if (++count === 1) check(h.refresh() === h);
          else {
            h.close();
            resolve();
          }
        }, 0);
      });
      equal(count, 2);
      let fired = false;
      const h = t.setTimeout(() => {
        fired = true;
      }, 1000);
      check(h.close() === h);
      check(h.refresh() === h);
      h.close();
      check(!fired);
    },
    async repeat({ t }) {
      let count = 0;
      await new Promise<void>((resolve) => {
        const h = t.setInterval(
          (v) => {
            equal(v, "tick");
            if (++count === 3) {
              t.clearTimeout(h);
              resolve();
            }
          },
          1,
          "tick",
        );
      });
      equal(count, 3);
    },
    refs({ t }) {
      const h = t.setTimeout(() => {}, 1000);
      try {
        check(h.hasRef());
        check(h.unref() === h);
        check(!h.hasRef());
        check(h.ref() === h);
        check(h.hasRef());
        check(h.close() === h);
        check(h.hasRef());
      } finally {
        h.close();
      }
    },
    async constructor({ t }) {
      const a = new t.Timeout(() => {}, 1000);
      check(!a.hasRef());
      a.close();
      let count = 0;
      await new Promise<void>((resolve) => {
        const h = new t.Timeout(
          (v) => {
            equal(v, 7);
            if (++count === 2) {
              h.close();
              resolve();
            }
          },
          1,
          [7],
          true,
          true,
        );
        check(h.hasRef());
      });
      error(() => new t.Timeout(() => {}, 1n as never), "TypeError");
    },
    receivers({ t }) {
      for (const method of [
        "refresh",
        "ref",
        "unref",
        "hasRef",
        "close",
      ] as const)
        error(
          () => Reflect.apply(t.Timeout.prototype[method], {}, []),
          "TypeError",
        );
      error(
        () => t.Timeout.prototype[Symbol.toPrimitive].call({} as never),
        "TypeError",
      );
      error(
        () => t.Timeout.prototype[Symbol.dispose].call({} as never),
        "TypeError",
      );
    },
    async legacy({ t, p }) {
      const h = t.setTimeout(() => {
        throw new Error("cancelled");
      }, 1);
      t.active(h);
      t.unenroll(h);
      t.unenroll(+h);
      t.active({} as never);
      t.unenroll({});
      error(() => t.enroll({}, 1), "Error");
      const d = t.setTimeout(() => {
        throw new Error("disposed");
      }, 1);
      d[Symbol.dispose]();
      d[Symbol.dispose]();
      await p.setTimeout(5);
    },
    async delay({ t, p }) {
      for (const delay of [NaN, -Infinity, -1, 0, "0", null])
        await new Promise<void>((resolve) =>
          t.setTimeout(resolve, delay as never),
        );
      error(() => t.setTimeout(() => {}, 1n as never), "TypeError");
      error(() => t.setInterval(() => {}, Symbol() as never), "TypeError");
      let fired = 0;
      const handles = [Infinity, 2147483648, 3153600000001].map((ms) =>
        t.setTimeout(() => fired++, ms),
      );
      await p.setTimeout(10);
      for (const h of handles) t.clearTimeout(h);
      equal(fired, 0);
    },
    async immediate({ t }) {
      let sync = true;
      await new Promise<void>((resolve) => {
        const h = t.setImmediate((a) => {
          check(!sync);
          equal(a, 42);
          resolve();
        }, 42);
        equal(h.hasRef(), false);
        equal(h.ref(), undefined);
        equal(h.unref(), undefined);
        sync = false;
      });
    },
    async immediateCancel({ t, p }) {
      let calls = 0;
      const a = t.setImmediate(() => calls++);
      t.clearImmediate(a);
      t.clearImmediate(a);
      const b = t.setImmediate(() => calls++);
      b[Symbol.dispose]();
      await p.setTimeout(5);
      equal(calls, 0);
      error(() => t.clearImmediate({} as never), "TypeError");
      error(() => t.setImmediate(3 as never), "TypeError");
    },
    promisesSurface({ t, p }) {
      equal(
        Object.keys(p).sort(),
        [
          "default",
          "scheduler",
          "setImmediate",
          "setInterval",
          "setTimeout",
        ].sort(),
      );
      equal(
        Object.keys(p.default).sort(),
        ["scheduler", "setImmediate", "setInterval", "setTimeout"].sort(),
      );
      check(
        t.promises.setTimeout === p.setTimeout &&
          p.setTimeout === barePromises.setTimeout,
      );
      check(
        t.promises.scheduler === p.scheduler &&
          p.scheduler === barePromises.scheduler,
      );
      equal(
        Object.getOwnPropertyNames(Object.getPrototypeOf(p.scheduler)).sort(),
        ["constructor", "wait", "yield"],
      );
    },
    async timeoutPromise({ p }) {
      const marker = {};
      check((await p.setTimeout(0, marker, { ref: false })) === marker);
      equal(await p.setTimeout(), undefined);
      check((await p.setTimeout(NaN, 5)) === 5);
    },
    async immediatePromise({ p }) {
      const marker = {};
      check((await p.setImmediate(marker, { ref: false })) === marker);
      equal(await p.setImmediate(), undefined);
    },
    async promiseValidation({ p }) {
      for (const options of [null, [], 1, "x", () => {}]) {
        await rejected(
          p.setTimeout(0, 0, options as never),
          "TypeError",
          "ERR_INVALID_ARG_TYPE",
        );
        await rejected(
          p.setImmediate(0, options as never),
          "TypeError",
          "ERR_INVALID_ARG_TYPE",
        );
        await rejected(
          p.setInterval(0, 0, options as never).next(),
          "TypeError",
          "ERR_INVALID_ARG_TYPE",
        );
      }
      for (const delay of [null, "0", 1n, {}]) {
        await rejected(
          p.setTimeout(delay as never),
          "TypeError",
          "ERR_INVALID_ARG_TYPE",
        );
        await rejected(
          p.setInterval(delay as never).next(),
          "TypeError",
          "ERR_INVALID_ARG_TYPE",
        );
      }
      for (const options of [
        { ref: 1 },
        { signal: null },
        { signal: {} },
        { signal: 3 },
      ]) {
        await rejected(
          p.setTimeout(0, 0, options as never),
          "TypeError",
          "ERR_INVALID_ARG_TYPE",
        );
        await rejected(
          p.setImmediate(0, options as never),
          "TypeError",
          "ERR_INVALID_ARG_TYPE",
        );
        await rejected(
          p.setInterval(0, 0, options as never).next(),
          "TypeError",
          "ERR_INVALID_ARG_TYPE",
        );
      }
    },
    async preAbort({ p }) {
      const reason = { why: "stop" };
      const signal = AbortSignal.abort(reason);
      for (const task of [
        p.setTimeout(100, 0, { signal }),
        p.setImmediate(0, { signal }),
        p.setInterval(100, 0, { signal }).next(),
      ]) {
        const e = await rejected(task, "AbortError", "ABORT_ERR");
        check(e.cause === reason);
        equal(e.message, "The operation was aborted");
      }
    },
    async abort({ p }) {
      for (const run of [
        (signal: AbortSignal) => p.setTimeout(1000, 0, { signal }),
        (signal: AbortSignal) => p.setImmediate(0, { signal }),
      ]) {
        const c = new AbortController();
        const task = run(c.signal);
        c.abort("stop");
        check(
          (await rejected(task, "AbortError", "ABORT_ERR")).cause === "stop",
        );
      }
    },
    async interval({ p }) {
      const it = p.setInterval(1, "tick");
      equal(await it.next(), { value: "tick", done: false });
      equal(await it.next(), { value: "tick", done: false });
      equal(await it.return(undefined), { done: true });
      equal(await it.next(), { done: true });
    },
    async intervalAbort({ p }) {
      const c = new AbortController();
      const it = p.setInterval(1000, 1, { signal: c.signal });
      const pending = it.next();
      c.abort("stop");
      check(
        (await rejected(pending, "AbortError", "ABORT_ERR")).cause === "stop",
      );
      equal(await it.next(), { done: true });
    },
    async intervalCleanup({ p }) {
      const c = new AbortController();
      let adds = 0,
        removes = 0;
      const add = c.signal.addEventListener.bind(c.signal),
        remove = c.signal.removeEventListener.bind(c.signal);
      c.signal.addEventListener = ((...a: Parameters<typeof add>) => {
        adds++;
        return add(...a);
      }) as typeof add;
      c.signal.removeEventListener = ((...a: Parameters<typeof remove>) => {
        removes++;
        return remove(...a);
      }) as typeof remove;
      const it = p.setInterval(1, 0, { signal: c.signal });
      await it.next();
      await it.return(undefined);
      equal([adds, removes], [1, 1]);
      c.abort();
    },
    async scheduler({ p }) {
      equal(await p.scheduler.yield(), undefined);
      for (const v of [undefined, null, 0, -1, NaN, "0"])
        equal(await p.scheduler.wait(v as never), undefined);
      equal(await p.scheduler.wait(0, null as never), undefined);
      equal(await p.scheduler.wait(0, [] as never), undefined);
    },
    async schedulerAbort({ p }) {
      for (const pre of [true, false]) {
        for (const why of ["stop", new TypeError("bad"), { a: 1 }]) {
          const c = new AbortController();
          if (pre) c.abort(why);
          const task = p.scheduler.wait(1000, { signal: c.signal });
          if (!pre) c.abort(why);
          try {
            await task;
            throw Error("not rejected");
          } catch (e) {
            check(e !== why);
            if (typeof why === "string")
              equal(
                [(e as Error).name, (e as Error).message],
                ["Error", "stop"],
              );
            else if (why instanceof Error)
              equal(
                [(e as Error).name, (e as Error).message],
                ["TypeError", "bad"],
              );
            else equal(e, why);
          }
        }
      }
    },
    async schedulerUncloneable({ p }) {
      const fn = () => {};
      const cases: [unknown, string][] = [
        [fn, String(fn)],
        [Symbol("x"), "Symbol(x)"],
        [new WeakMap(), "#<WeakMap>"],
        [{ fn }, "#<Object>"],
        [
          {
            get x() {
              throw new Error("getter");
            },
          },
          "#<Object>",
        ],
        [new Proxy({}, {}), "#<Object>"],
        [{ fn, [Symbol.toStringTag]: "Custom" }, "#<Object>"],
        [Object.assign(Object.create(null), { fn }), "[object Object]"],
      ];
      for (const pre of [true, false])
        for (const [why, message] of cases) {
          const c = new AbortController();
          if (pre) c.abort(why);
          const task = p.scheduler.wait(1000, { signal: c.signal });
          if (!pre) c.abort(why);
          await task.then(
            () => {
              throw new Error("not rejected");
            },
            (e) => {
              equal([e.name, e.message], ["Error", message]);
            },
          );
        }
      for (const pre of [true, false]) {
        const dom = new DOMException("stop", "AbortError");
        Object.defineProperty(dom, "message", {
          get() {
            throw Error("shadow");
          },
        });
        for (const [why, name, message] of [
          [dom, "AbortError", "stop"],
        ] as const) {
          const c = new AbortController();
          if (pre) c.abort(why);
          const task = p.scheduler.wait(1000, { signal: c.signal });
          if (!pre) c.abort(why);
          await task.then(
            () => {
              throw Error("not rejected");
            },
            (e) => equal([e.name, e.message], [name, message]),
          );
        }
      }
    },
    async schedulerSignalState({ p }) {
      for (const pre of [true, false])
        for (const property of [
          "aborted",
          "reason",
          "addEventListener",
          "removeEventListener",
          "stopPropagation",
        ]) {
          const c = new AbortController();
          if (property === "stopPropagation")
            c.signal.addEventListener("abort", (e) =>
              e.stopImmediatePropagation(),
            );
          else
            Object.defineProperty(c.signal, property, {
              value:
                property === "aborted"
                  ? false
                  : property === "reason"
                    ? "fake"
                    : () => {
                        throw Error("override");
                      },
            });
          if (pre) c.abort("real");
          const task = p.scheduler.wait(1000, { signal: c.signal });
          if (!pre) c.abort("real");
          await task.then(
            () => {
              throw new Error("not rejected");
            },
            (e) => {
              equal([e.name, e.message], ["Error", "real"]);
            },
          );
        }
    },
    async schedulerValidation({ p }) {
      error(
        () => p.scheduler.yield.call({} as never),
        "TypeError",
        "ERR_INVALID_THIS",
      );
      error(
        () => p.scheduler.wait.call({} as never, 0),
        "TypeError",
        "ERR_INVALID_THIS",
      );
      await rejected(p.scheduler.wait(1n as never), "TypeError");
      await rejected(p.scheduler.wait(0, 1 as never), "TypeError");
      await rejected(p.scheduler.wait(0, { signal: {} as never }), "TypeError");
    },
    async context({ t }) {
      const als = new AsyncLocalStorage<string>();
      const results: unknown[] = [];
      const jobs = [
        t.setTimeout,
        globalThis.setTimeout,
        t.setImmediate,
        globalThis.setImmediate,
      ].map(
        (schedule, i) =>
          new Promise<void>((resolve) => {
            als.run(String(i), () => {
              (schedule as (callback: () => void, delay: number) => unknown)(
                () => {
                  results[i] = als.getStore();
                  resolve();
                },
                0,
              );
            });
          }),
      );
      await Promise.all(jobs);
      equal(results, ["0", "1", "2", "3"]);
      check(
        globalThis.setTimeout === (t.setTimeout as unknown),
        "ALS must preserve timer identity",
      );
      check(globalThis.setInterval === (t.setInterval as unknown));
    },
    globalIdentity({ t }) {
      check(
        globalThis.setTimeout === (t.setTimeout as unknown),
        "setTimeout identity",
      );
      check(
        globalThis.clearTimeout === (t.clearTimeout as unknown),
        "clearTimeout identity",
      );
      check(
        globalThis.setInterval === (t.setInterval as unknown),
        "setInterval identity",
      );
      check(
        globalThis.clearInterval === (t.clearInterval as unknown),
        "clearInterval identity",
      );
      const h = globalThis.setTimeout(() => {}, 1000);
      check(h instanceof t.Timeout);
      globalThis.clearTimeout(h);
    },
  },
};
export class TimersImplementation extends FeatureImplementation<
  typeof timersFeature
> {
  constructor() {
    super(
      timersFeature,
      Object.fromEntries(
        operations.map((id) => [id, { status: "supported" }]),
      ) as Record<(typeof operations)[number], { status: "supported" }>,
    );
  }
  create(): Api {
    return {
      t: nodeTimers as unknown as Api["t"],
      p: nodePromises as unknown as Api["p"],
    };
  }
}

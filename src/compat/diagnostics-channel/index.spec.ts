import {
  defineFeature,
  FeatureImplementation,
} from "cf-workers-native/shared/contracts";
import type { ContractSuite } from "cf-workers-native/shared/contracts/testing";
import * as namespace from "node:diagnostics_channel";
import { AsyncLocalStorage as HostAsyncLocalStorage } from "node:async_hooks";
const AsyncLocalStorage =
  HostAsyncLocalStorage as unknown as typeof import("../async-hooks/index.js").AsyncLocalStorage;
const api = namespace as unknown as typeof import("./index.js");
export const diagnosticsFeature = defineFeature<typeof api>()(
  "node.diagnostics_channel",
  [
    "exports",
    "identity",
    "names",
    "subscribers",
    "snapshots",
    "errors",
    "stores",
    "storeSnapshots",
    "tracingIdentity",
    "traceSync",
    "traceSyncError",
    "tracePromise",
    "tracePromiseError",
    "traceCallback",
    "validation",
  ],
);
function check(
  value: unknown,
  message = "diagnostics mismatch",
): asserts value {
  if (!value) throw Error(message);
}
function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw Error(`${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
}
function failure(fn: () => unknown, name: string, message?: string) {
  try {
    fn();
  } catch (e) {
    check((e as Error).name === name);
    if (message !== undefined) equal((e as Error).message, message);
    return;
  }
  throw Error("Expected failure");
}
let serial = 0;
const unique = () => `contract:${++serial}`;
export const diagnosticsContract: ContractSuite<typeof diagnosticsFeature> = {
  feature: diagnosticsFeature,
  cases: {
    exports(d) {
      equal(
        Object.keys(d).sort(),
        [
          "Channel",
          "TracingChannel",
          "channel",
          "default",
          "hasSubscribers",
          "subscribe",
          "tracingChannel",
          "unsubscribe",
        ].sort(),
      );
      for (const [key, value] of Object.entries(d.default))
        check((d as any)[key] === value);
    },
    identity(d) {
      const name = unique(),
        c = d.channel(name);
      check(c === d.channel(name));
      check(c instanceof d.Channel);
      equal(Object.keys(c), []);
      equal(Object.prototype.toString.call(c), "[object Channel]");
      check(!("name" in c));
      failure(() => new d.Channel(), "TypeError", "Illegal constructor");
    },
    names(d) {
      const name = unique(),
        sym = Symbol(name);
      check(d.channel(sym) === d.channel(Symbol(name)));
      check(d.channel(sym) === d.channel(String(sym)));
      check(d.channel(sym) !== d.channel(name));
      const c = d.channel(sym);
      let seen: unknown;
      const fn = (_: unknown, key: unknown) => {
        seen = key;
      };
      c.subscribe(fn);
      c.publish(0);
      c.unsubscribe(fn);
      check(seen === sym);
      const calls: string[] = [];
      check(
        d.channel({
          [Symbol.toPrimitive](hint: string) {
            calls.push(hint);
            return name;
          },
        } as any) === d.channel(name),
      );
      equal(calls, ["string"]);
    },
    subscribers(d) {
      const name = unique(),
        c = d.channel(name),
        seen: string[] = [];
      const a = () => seen.push("a"),
        b = () => seen.push("b"),
        z = () => seen.push("z");
      check(!d.hasSubscribers(name));
      equal(d.subscribe(name, a), undefined);
      c.subscribe(a);
      c.subscribe(b);
      c.subscribe(z);
      check(c.hasSubscribers && d.hasSubscribers(name));
      equal(c.unsubscribe(a), undefined);
      c.publish(1);
      equal(seen, ["z", "b"]);
      d.unsubscribe(name, z);
      d.unsubscribe(name, b);
      check(!c.hasSubscribers);
      equal(d.unsubscribe(unique(), a), undefined);
    },
    snapshots(d) {
      const c = d.channel(unique()),
        seen: string[] = [];
      const b = function (this: unknown) {
        check(this === globalThis);
        seen.push("b");
      };
      const a = () => {
        seen.push("a");
        c.unsubscribe(b);
      };
      c.subscribe(a);
      c.subscribe(b);
      c.publish(null);
      equal(seen, ["a", "b"]);
      seen.length = 0;
      c.publish(null);
      equal(seen, ["a"]);
      c.unsubscribe(a);
    },
    errors(d) {
      const c = d.channel(unique()),
        error = new Error("subscriber");
      let reached = false;
      const a = () => {
          throw error;
        },
        b = () => {
          reached = true;
        };
      c.subscribe(a);
      c.subscribe(b);
      try {
        c.publish(1);
        throw Error("did not throw");
      } catch (e) {
        check(e === error);
      }
      check(!reached);
      c.unsubscribe(a);
      c.unsubscribe(b);
    },
    stores(d) {
      const a = new AsyncLocalStorage(),
        b = new AsyncLocalStorage(),
        c = d.channel(unique());
      c.bindStore(a);
      c.bindStore(b, (message) => {
        check(a.getStore() === message);
        return "second";
      });
      const message = {};
      const fn = (value: unknown) => {
        check(value === message);
        check(a.getStore() === message);
        check(b.getStore() === "second");
      };
      c.subscribe(fn);
      const receiver = {};
      const result = c.runStores(
        message,
        function (this: unknown, x: unknown) {
          check(this === receiver);
          check(a.getStore() === message);
          return x;
        },
        receiver,
        7,
      );
      equal(result, 7);
      check(a.getStore() === undefined && b.getStore() === undefined);
      c.unsubscribe(fn);
      equal(c.unbindStore(a), undefined);
      c.unbindStore(b);
      const published: unknown[] = [];
      const subscriber = (value: unknown) => published.push(value);
      c.subscribe(subscriber);
      c.publish = () => {
        throw Error("Overridden public publish must not intercept runStores");
      };
      c.runStores(5, () => {});
      equal(published, [5]);
      c.unsubscribe(subscriber);
    },
    storeSnapshots(d) {
      const a = new AsyncLocalStorage(),
        b = new AsyncLocalStorage(),
        c = d.channel(unique());
      c.bindStore(a, () => {
        c.unbindStore(b);
        return 1;
      });
      c.bindStore(b, () => 2);
      c.runStores(null, () => equal([a.getStore(), b.getStore()], [1, 2]));
      c.runStores(null, () =>
        equal([a.getStore(), b.getStore()], [1, undefined]),
      );
      c.bindStore(a, () => 3);
      c.runStores(null, () => equal(a.getStore(), 3));
      c.unbindStore(a);
    },
    tracingIdentity(d) {
      const name = unique(),
        t = d.tracingChannel(name);
      check(t instanceof d.TracingChannel);
      check(t.start === d.channel(`tracing:${name}:start`));
      check(typeof (t as any).hasSubscribers === "boolean");
      const other = d.tracingChannel({
        start: t.start!,
        end: t.end!,
        asyncStart: t.asyncStart!,
        asyncEnd: t.asyncEnd!,
        error: t.error!,
      });
      check(other.start === t.start);
      failure(
        () => new d.TracingChannel(),
        "Error",
        "Use diagnostic_channel.tracingChannels() to create TracingChannel",
      );
    },
    traceSync(d) {
      const t = d.tracingChannel(unique()),
        seen: string[] = [],
        context: any = {},
        receiver = {};
      const subs = {
        start: () => seen.push("start"),
        end: () => seen.push("end"),
      };
      t.subscribe(subs);
      check((t as any).hasSubscribers);
      equal(
        t.traceSync(
          function (this: unknown, x: unknown) {
            check(this === receiver);
            seen.push("fn");
            return x;
          },
          context,
          receiver,
          9,
        ),
        9,
      );
      equal(context.result, 9);
      equal(seen, ["start", "fn", "end"]);
      t.unsubscribe(subs);
      check(!(t as any).hasSubscribers);
    },
    traceSyncError(d) {
      const t = d.tracingChannel(unique()),
        seen: string[] = [],
        context: any = {},
        error = new Error("trace");
      const subs = {
        error: () => seen.push("error"),
        end: () => seen.push("end"),
      };
      t.subscribe(subs);
      try {
        t.traceSync(() => {
          throw error;
        }, context);
        throw Error("did not throw");
      } catch (e) {
        check(e === error);
      }
      equal(seen, ["error", "end"]);
      check(context.error === error);
      t.unsubscribe(subs);
    },
    async tracePromise(d) {
      const t = d.tracingChannel(unique()),
        seen: string[] = [],
        context: any = {};
      const subs = {
        start: () => seen.push("start"),
        end: () => seen.push("end"),
        asyncStart: () => seen.push("asyncStart"),
        asyncEnd: () => seen.push("asyncEnd"),
      };
      t.subscribe(subs);
      const result = t.tracePromise(() => Promise.resolve(12), context);
      equal(seen, ["start", "end"]);
      equal(await result, 12);
      equal(context.result, 12);
      equal(seen, ["start", "end", "asyncStart", "asyncEnd"]);
      t.unsubscribe(subs);
    },
    async tracePromiseError(d) {
      const t = d.tracingChannel(unique()),
        seen: string[] = [],
        context: any = {},
        error = new Error("reject");
      const subs = {
        error: () => seen.push("error"),
        end: () => seen.push("end"),
        asyncStart: () => seen.push("asyncStart"),
        asyncEnd: () => seen.push("asyncEnd"),
      };
      t.subscribe(subs);
      try {
        await t.tracePromise(() => Promise.reject(error), context);
        throw Error("did not reject");
      } catch (e) {
        check(e === error);
      }
      equal(seen, ["end", "error", "asyncStart", "asyncEnd"]);
      check(context.error === error);
      t.unsubscribe(subs);
    },
    traceCallback(d) {
      const t = d.tracingChannel(unique()),
        seen: string[] = [],
        context: any = {};
      const subs = {
        start: () => seen.push("start"),
        end: () => seen.push("end"),
        asyncStart: () => seen.push("asyncStart"),
        asyncEnd: () => seen.push("asyncEnd"),
      };
      t.subscribe(subs);
      const receiver = {};
      equal(
        t.traceCallback(
          (cb: any) => {
            cb.call(receiver, null, 4);
            return 8;
          },
          0,
          context,
          null,
          function (this: unknown, err: unknown, value: unknown) {
            check(this === receiver);
            equal([err, value], [null, 4]);
            seen.push("callback");
          },
        ),
        8,
      );
      equal(context.result, 4);
      equal(seen, ["start", "asyncStart", "callback", "asyncEnd", "end"]);
      t.unsubscribe(subs);
      failure(
        () =>
          t.traceCallback(
            () => {},
            undefined,
            {},
            null,
            () => {},
          ),
        "TypeError",
      );
    },
    validation(d) {
      const c = d.channel(unique());
      failure(() => (d.Channel as any)(), "TypeError", "Illegal constructor");
      for (const name of [
        "publish",
        "subscribe",
        "unsubscribe",
        "bindStore",
        "unbindStore",
        "runStores",
      ] as const)
        equal(c[name].length, 0);
      for (const method of ["subscribe", "unsubscribe"] as const)
        failure(
          () => d[method](unique(), 1 as any),
          "TypeError",
          `Failed to execute '${method}' on 'DiagnosticsChannelModule': parameter 2 is not of type 'function'.`,
        );
      failure(
        () => c.bindStore(Object.create(AsyncLocalStorage.prototype)),
        "TypeError",
        "Failed to execute 'bindStore' on 'Channel': parameter 1 is not of type 'AsyncLocalStorage'.",
      );
      for (const method of ["subscribe", "unsubscribe"] as const)
        failure(
          () => c[method](1 as any),
          "TypeError",
          `Failed to execute '${method}' on 'Channel': parameter 1 is not of type 'function'.`,
        );
      failure(
        () => c.runStores(null, 1 as any),
        "TypeError",
        "Failed to execute 'runStores' on 'Channel': parameter 2 is not of type 'function'.",
      );
      for (const method of ["bindStore", "unbindStore"] as const)
        failure(
          () => c[method]({} as any),
          "TypeError",
          `Failed to execute '${method}' on 'Channel': parameter 1 is not of type 'AsyncLocalStorage'.`,
        );
      failure(() => d.tracingChannel({} as any), "TypeError");
    },
  },
};
export class DiagnosticsImplementation extends FeatureImplementation<
  typeof diagnosticsFeature
> {
  constructor(private readonly value = api) {
    super(diagnosticsFeature, {
      exports: { status: "supported" },
      identity: { status: "supported" },
      names: { status: "supported" },
      subscribers: { status: "supported" },
      snapshots: { status: "supported" },
      errors: { status: "supported" },
      stores: { status: "supported" },
      storeSnapshots: { status: "supported" },
      tracingIdentity: { status: "supported" },
      traceSync: { status: "supported" },
      traceSyncError: { status: "supported" },
      tracePromise: { status: "supported" },
      tracePromiseError: { status: "supported" },
      traceCallback: { status: "supported" },
      validation: { status: "supported" },
    });
  }
  create() {
    return this.value;
  }
}

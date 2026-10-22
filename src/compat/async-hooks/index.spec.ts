import * as nodeAsyncHooks from "node:async_hooks";
import {
  defineFeature,
  FeatureImplementation,
} from "cf-workers-native/shared/contracts";
import type { ContractSuite } from "cf-workers-native/shared/contracts/testing";
// Resolve through the environment alias, including the real workerd oracle.
const local = nodeAsyncHooks as unknown as typeof import("./index.js");
function failure(fn: () => unknown, message: string) {
  try {
    fn();
  } catch (error) {
    equal((error as Error).message, message);
    return;
  }
  throw Error("Expected rejection");
}
export const asyncHooksFeature = defineFeature<typeof local>()(
  "node.async-hooks",
  [
    "surface",
    "hookStubs",
    "storageOptions",
    "receivers",
    "resourceBinding",
    "argumentValidation",
    "resourceOptions",
    "run",
    "nesting",
    "exit",
    "enterWith",
    "disable",
    "bind",
    "snapshot",
    "throwRestore",
    "awaitPropagation",
    "settleRestore",
    "nestedAsyncRestore",
    "concurrentIsolation",
    "microtaskTimer",
    "resourceScope",
    "resourceMeta",
  ],
);
const equal = (a: unknown, b: unknown) => {
  if (a !== b) throw new Error(`${String(a)} != ${String(b)}`);
};
export const asyncHooksContract: ContractSuite<typeof asyncHooksFeature> = {
  feature: asyncHooksFeature,
  cases: {
    surface(api) {
      const names = [
        "AsyncLocalStorage",
        "AsyncResource",
        "asyncWrapProviders",
        "createHook",
        "executionAsyncId",
        "executionAsyncResource",
        "triggerAsyncId",
      ];
      equal(
        Object.keys(api).sort().join(),
        [...names, "default"].sort().join(),
      );
      equal(Object.keys(api.default).sort().join(), names.sort().join());
      for (const name of names)
        equal((api as any)[name], (api.default as any)[name]);
    },
    async hookStubs(api) {
      let invoked = false;
      const hook = (api.createHook as any)({
        init() {
          invoked = true;
        },
      });
      equal(hook.enable(), hook);
      equal(hook.disable(), hook);
      await Promise.resolve();
      equal(invoked, false);
      equal(api.executionAsyncId(), 0);
      equal(api.triggerAsyncId(), 0);
      const one = api.executionAsyncResource(),
        two = api.executionAsyncResource();
      equal(Object.getPrototypeOf(one), null);
      equal(Object.keys(one).length, 0);
      equal(one === two, false);
      equal(
        Object.values(api.asyncWrapProviders).every((value) => value === 0),
        true,
      );
      equal(api.asyncWrapProviders.PROMISE, 0);
      equal(api.asyncWrapProviders.TLSWRAP, 0);
    },
    storageOptions(api) {
      const value = { sentinel: true };
      const als = new api.AsyncLocalStorage<unknown>({
        name: "named",
        defaultValue: value,
      });
      equal(als.name, "named");
      equal(als.getStore(), value);
      equal(
        als.run(undefined, () => als.getStore()),
        undefined,
      );
      equal(
        als.exit(() => als.getStore()),
        undefined,
      );
      equal(als.getStore(), value);
      equal(new api.AsyncLocalStorage().name, "");
      equal(new api.AsyncLocalStorage({ name: 1 as any }).name, "1");
      equal(new api.AsyncLocalStorage(null as any).name, "");
    },
    receivers(api) {
      const als = new api.AsyncLocalStorage();
      equal(
        als.run(1, function (this: unknown) {
          return this;
        }),
        globalThis,
      );
      equal(
        als.exit(function (this: unknown) {
          return this;
        }),
        globalThis,
      );
      const bound = api.AsyncLocalStorage.bind(function (this: unknown) {
        return this;
      });
      equal(bound.call({}), globalThis);
      equal(bound.call(null), globalThis);
      const resource = new api.AsyncResource("x");
      equal(
        resource.runInAsyncScope(function (this: unknown) {
          return this;
        }),
        globalThis,
      );
      equal(
        resource.runInAsyncScope(function (this: unknown) {
          return this;
        }, null),
        null,
      );
    },
    resourceBinding(api) {
      const resource = new api.AsyncResource("x");
      const bound = resource.bind(function (this: unknown, a: number) {
        return [this, a];
      }, null);
      equal((bound as any).asyncResource, resource);
      equal(bound.name, "");
      equal(bound.length, 0);
      equal(bound.call({}, 4)[0], null);
      equal(bound(4)[1], 4);
      const staticBound = api.AsyncResource.bind(
        function (this: unknown) {
          return this;
        },
        "x",
        null,
      );
      equal(staticBound(), null);
      equal(
        (staticBound as any).asyncResource instanceof api.AsyncResource,
        true,
      );
    },
    argumentValidation(api) {
      const message =
        "Illegal invocation: function called with incorrect `this` reference. See https://developers.cloudflare.com/workers/observability/errors/#illegal-invocation-errors for details.";
      failure(
        () => api.AsyncLocalStorage.prototype.run.call({} as any, 1, () => {}),
        message,
      );
      failure(
        () => api.AsyncResource.prototype.emitDestroy.call({} as any),
        message,
      );
      const als = new api.AsyncLocalStorage();
      failure(
        () => als.run(1, 1 as any),
        "Failed to execute 'run' on 'AsyncLocalStorage': parameter 2 is not of type 'function'.",
      );
      failure(
        () => api.AsyncLocalStorage.bind(1 as any),
        "Failed to execute 'bind' on 'AsyncLocalStorage': parameter 1 is not of type 'Function'.",
      );
      failure(
        () => new api.AsyncLocalStorage(1 as any),
        "Failed to construct 'AsyncLocalStorage': constructor parameter 1 is not of type 'AsyncLocalStorageOptions'.",
      );
      failure(
        () => new api.AsyncResource(Symbol() as any),
        "Cannot convert a Symbol value to a string",
      );
    },
    resourceOptions(api) {
      for (const triggerAsyncId of [0, null, 1] as any[])
        failure(
          () => new api.AsyncResource("x", { triggerAsyncId }),
          "The 'triggerAsyncId' field on 'Options' is not implemented.",
        );
      new api.AsyncResource("x", { triggerAsyncId: undefined });
      new api.AsyncResource(1 as any);
      equal(Object.keys(new api.AsyncResource("x")).length, 0);
    },
    run(api) {
      const als = new api.AsyncLocalStorage<unknown>();
      equal(als.getStore(), undefined);
      const result = als.run(
        "store",
        (a: number) => {
          equal(als.getStore(), "store");
          return a + 1;
        },
        1,
      );
      equal(result, 2);
      equal(als.getStore(), undefined);
    },
    nesting(api) {
      const als = new api.AsyncLocalStorage<unknown>();
      als.run("outer", () => {
        equal(als.getStore(), "outer");
        als.run("inner", () => equal(als.getStore(), "inner"));
        equal(als.getStore(), "outer");
        als.run(undefined, () => equal(als.getStore(), undefined));
        equal(als.getStore(), "outer");
      });
      const second = new api.AsyncLocalStorage<unknown>();
      als.run("a", () => {
        second.run("b", () => {
          equal(als.getStore(), "a");
          equal(second.getStore(), "b");
        });
      });
    },
    exit(api) {
      const als = new api.AsyncLocalStorage<unknown>();
      als.run("store", () => {
        const result = als.exit((a: number) => {
          equal(als.getStore(), undefined);
          return a * 2;
        }, 2);
        equal(result, 4);
        equal(als.getStore(), "store");
      });
    },
    enterWith(api) {
      const als = new api.AsyncLocalStorage<unknown>();
      failure(
        () => als.enterWith("top"),
        "asyncLocalStorage.enterWith() is not implemented",
      );
      equal(als.getStore(), undefined);
    },
    disable(api) {
      const als = new api.AsyncLocalStorage<unknown>();
      als.run("store", () => {
        failure(
          () => als.disable(),
          "asyncLocalStorage.disable() is not implemented",
        );
        equal(als.getStore(), "store");
      });
    },
    bind(api) {
      const als = new api.AsyncLocalStorage<unknown>();
      const bound = als.run("store", () =>
        api.AsyncLocalStorage.bind((a: number, b: number) => {
          equal(als.getStore(), "store");
          return a + b;
        }),
      );
      equal(bound(1, 2), 3);
    },
    snapshot(api) {
      const als = new api.AsyncLocalStorage<unknown>();
      const snapshot = als.run("store", () => api.AsyncLocalStorage.snapshot());
      equal(als.getStore(), undefined);
      equal(
        snapshot((a: number) => {
          equal(als.getStore(), "store");
          return a * 3;
        }, 2),
        6,
      );
      equal(als.getStore(), undefined);
    },
    async throwRestore(api) {
      const als = new api.AsyncLocalStorage<unknown>();
      const reason = new Error("boom");
      let observed: unknown;
      try {
        als.run("store", () => {
          throw reason;
        });
      } catch (error) {
        observed = error;
      }
      equal(observed === reason, true);
      equal(als.getStore(), undefined);
      observed = undefined;
      try {
        await als.run("store", async () => {
          equal(als.getStore(), "store");
          throw reason;
        });
      } catch (error) {
        observed = error;
      }
      equal(observed === reason, true);
      equal(als.getStore(), undefined);
    },
    async awaitPropagation(api) {
      const als = new api.AsyncLocalStorage<unknown>();
      const tick = () => new Promise<void>((resolve) => resolve());
      await als.run("store", async () => {
        equal(als.getStore(), "store");
        for (let i = 0; i < 3; i++) {
          await tick();
          equal(als.getStore(), "store");
        }
        const value = await Promise.resolve("kept").then((v) => {
          equal(als.getStore(), "store");
          return v;
        });
        equal(value, "kept");
        await Promise.resolve("ignored").catch(() => "unreached");
        equal(als.getStore(), "store");
        await Promise.resolve().finally(() => {
          equal(als.getStore(), "store");
        });
        const [a, b] = await Promise.all([
          Promise.resolve(1).then((v) => {
            equal(als.getStore(), "store");
            return v;
          }),
          Promise.resolve(2),
        ]);
        equal(a, 1);
        equal(b, 2);
      });
    },
    async settleRestore(api) {
      const als = new api.AsyncLocalStorage<unknown>();
      await als.run("store", async () => {
        equal(als.getStore(), "store");
      });
      equal(als.getStore(), undefined);
      const reason = new Error("boom");
      let observed: unknown;
      try {
        await als.run("store", async () => {
          throw reason;
        });
      } catch (error) {
        observed = error;
      }
      equal(observed === reason, true);
      equal(als.getStore(), undefined);
    },
    async nestedAsyncRestore(api) {
      const als = new api.AsyncLocalStorage<unknown>();
      await als.run("outer", async () => {
        await als.run("inner", async () => {
          equal(als.getStore(), "inner");
        });
        equal(als.getStore(), "outer");
      });
      equal(als.getStore(), undefined);
    },
    async concurrentIsolation(api) {
      const als = new api.AsyncLocalStorage<unknown>();
      const gate = () => {
        let release!: () => void;
        return [
          new Promise<void>((resolve) => (release = resolve)),
          release,
        ] as const;
      };
      const [g1, r1] = gate();
      const [g2, r2] = gate();
      const seen: unknown[] = [];
      const first = als.run("first", async () => {
        await g1;
        seen.push(als.getStore());
        r2();
        await Promise.resolve();
        seen.push(als.getStore());
      });
      const second = als.run("second", async () => {
        await g2;
        seen.push(als.getStore());
        r1();
        await Promise.resolve();
        seen.push(als.getStore());
      });
      r1();
      await Promise.all([first, second]);
      equal(seen.join(","), "first,second,first,second");
      equal(als.getStore(), undefined);
    },
    async microtaskTimer(api) {
      const als = new api.AsyncLocalStorage<unknown>();
      await als.run("store", async () => {
        await new Promise<void>((resolve) =>
          queueMicrotask(() => {
            equal(als.getStore(), "store");
            resolve();
          }),
        );
        await new Promise<void>((resolve) =>
          setTimeout(
            (a: number, b: string) => {
              equal(als.getStore(), "store");
              equal(a, 1);
              equal(b, "x");
              resolve();
            },
            0,
            1,
            "x",
          ),
        );
      });
    },
    resourceScope(api) {
      const als = new api.AsyncLocalStorage<unknown>();
      const resource = als.run("store", () => new api.AsyncResource("TEST"));
      equal(
        resource.runInAsyncScope(
          (a: number) => {
            equal(als.getStore(), "store");
            return a + 1;
          },
          undefined,
          1,
        ),
        2,
      );
      const bound = resource.bind(() => als.getStore());
      equal(bound(), "store");
      const staticBound = als.run("static", () =>
        api.AsyncResource.bind(() => als.getStore()),
      );
      equal(staticBound(), "static");
    },
    resourceMeta(api) {
      const resource = new api.AsyncResource("TEST");
      equal("type" in resource, false);
      equal(resource.emitDestroy(), undefined);
      equal(resource.asyncId(), 0);
      equal(resource.triggerAsyncId(), 0);
    },
  },
};
export class AsyncHooksImplementation extends FeatureImplementation<
  typeof asyncHooksFeature
> {
  constructor(private readonly api = local) {
    super(asyncHooksFeature, {
      surface: { status: "supported" },
      hookStubs: { status: "supported" },
      storageOptions: { status: "supported" },
      receivers: { status: "supported" },
      resourceBinding: { status: "supported" },
      argumentValidation: { status: "supported" },
      resourceOptions: { status: "supported" },
      run: { status: "supported" },
      nesting: { status: "supported" },
      exit: { status: "supported" },
      enterWith: { status: "supported" },
      disable: { status: "supported" },
      bind: { status: "supported" },
      snapshot: { status: "supported" },
      throwRestore: { status: "supported" },
      awaitPropagation: { status: "supported" },
      settleRestore: { status: "supported" },
      nestedAsyncRestore: { status: "supported" },
      concurrentIsolation: { status: "supported" },
      microtaskTimer: { status: "supported" },
      resourceScope: { status: "supported" },
      resourceMeta: { status: "supported" },
    });
  }
  create() {
    return this.api;
  }
}
/** Runs the same contract against the environment's own node:async_hooks
 *  (workerd builtin in the workers profile). */
export class NodeAsyncHooks extends FeatureImplementation<
  typeof asyncHooksFeature
> {
  constructor() {
    super(asyncHooksFeature, {
      surface: { status: "supported" },
      hookStubs: { status: "supported" },
      storageOptions: { status: "supported" },
      receivers: { status: "supported" },
      resourceBinding: { status: "supported" },
      argumentValidation: { status: "supported" },
      resourceOptions: { status: "supported" },
      run: { status: "supported" },
      nesting: { status: "supported" },
      exit: { status: "supported" },
      enterWith: { status: "supported" },
      disable: { status: "supported" },
      bind: { status: "supported" },
      snapshot: { status: "supported" },
      throwRestore: { status: "supported" },
      awaitPropagation: { status: "supported" },
      settleRestore: { status: "supported" },
      nestedAsyncRestore: { status: "supported" },
      concurrentIsolation: { status: "supported" },
      microtaskTimer: { status: "supported" },
      resourceScope: { status: "supported" },
      resourceMeta: { status: "supported" },
    });
  }
  create() {
    return nodeAsyncHooks as unknown as typeof local;
  }
}

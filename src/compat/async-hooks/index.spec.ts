import * as nodeAsyncHooks from "node:async_hooks";
import {
  defineFeature,
  FeatureImplementation,
} from "@rdlabo/capacitor-workers/features";
import type { ContractSuite } from "@rdlabo/capacitor-workers/testing";
import type { AsyncLocalStorage, AsyncResource } from "./index.js";
// Resolve implementations through the environment alias: importing the local
// implementation here would patch globals even in the workerd oracle realm.
const local = nodeAsyncHooks as unknown as {
  AsyncLocalStorage: typeof AsyncLocalStorage;
  AsyncResource: typeof AsyncResource;
};
export const asyncHooksFeature = defineFeature<typeof local>()(
  "node.async-hooks",
  [
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
      als.enterWith("top");
      equal(als.getStore(), "top");
      als.run("scoped", () => {
        equal(als.getStore(), "scoped");
        als.enterWith("mutated");
        equal(als.getStore(), "mutated");
      });
      equal(als.getStore(), "top");
    },
    disable(api) {
      const als = new api.AsyncLocalStorage<unknown>();
      als.run("store", () => {
        als.disable();
        equal(als.getStore(), undefined);
      });
      als.enterWith("top");
      als.disable();
      equal(als.getStore(), undefined);
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
      try {
        als.run("store", () => {
          throw new Error("boom");
        });
      } catch {
        // expected
      }
      equal(als.getStore(), undefined);
      try {
        await als.run("store", async () => {
          equal(als.getStore(), "store");
          throw new Error("async boom");
        });
      } catch {
        // expected
      }
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
      try {
        await als.run("store", async () => {
          throw new Error("boom");
        });
      } catch {
        // expected
      }
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
          setTimeout(() => {
            equal(als.getStore(), "store");
            resolve();
          }),
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
      equal(resource.type, "TEST");
      equal(resource.emitDestroy(), resource);
      equal(typeof resource.asyncId(), "number");
      equal(typeof resource.triggerAsyncId(), "number");
    },
  },
};
export class AsyncHooksImplementation extends FeatureImplementation<
  typeof asyncHooksFeature
> {
  constructor(private readonly api = local) {
    super(asyncHooksFeature, {
      run: { status: "supported" },
      nesting: { status: "supported" },
      exit: { status: "supported" },
      enterWith: { status: "supported" },
      disable: { status: "supported" },
      bind: { status: "supported" },
      snapshot: { status: "supported" },
      throwRestore: { status: "supported" },
      awaitPropagation: { status: "supported" },
      settleRestore: {
        status: "unsupported",
        reason:
          "Sticky approximation keeps the last context installed after the callback promise settles, so getStore returns a stale store instead of undefined.",
      },
      concurrentIsolation: {
        status: "unsupported",
        reason:
          "Isolating interleaved async contexts needs engine async hooks; this approximation keeps one context installed per pending callback.",
      },
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
      run: { status: "supported" },
      nesting: { status: "supported" },
      exit: { status: "supported" },
      enterWith: {
        status: "unsupported",
        reason: "workerd asyncLocalStorage.enterWith() is not implemented",
      },
      disable: {
        status: "unsupported",
        reason: "workerd asyncLocalStorage.disable() is not implemented",
      },
      bind: { status: "supported" },
      snapshot: { status: "supported" },
      throwRestore: { status: "supported" },
      awaitPropagation: { status: "supported" },
      settleRestore: { status: "supported" },
      concurrentIsolation: { status: "supported" },
      microtaskTimer: { status: "supported" },
      resourceScope: { status: "supported" },
      resourceMeta: {
        status: "unsupported",
        reason:
          "workerd AsyncResource does not expose constructor type or async ids",
      },
    });
  }
  create() {
    return nodeAsyncHooks as unknown as typeof local;
  }
}

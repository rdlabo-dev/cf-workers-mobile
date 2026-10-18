import { expect, it, vi } from "vitest";
import {
  defineFeature,
  FeatureImplementation,
  FeatureUnavailable,
  openFeature,
  type FeatureScope,
} from "../../src/contracts/index";
import {
  assertContract,
  runContract,
  type ContractSuite,
} from "../../src/contracts/testing";
const feature = defineFeature<{ read(): number }>()("probe", [
  "value",
  "fresh",
]);
const coverage = {
  value: { status: "supported" },
  fresh: { status: "supported" },
} as const;
const suite: ContractSuite<typeof feature> = {
  feature,
  cases: {
    value(api) {
      expect(api.read()).toBe(1);
    },
    fresh(api) {
      expect(api.read()).toBe(1);
    },
  },
};
class Probe extends FeatureImplementation<typeof feature> {
  constructor() {
    super(feature, coverage);
  }
  creates = 0;
  closes = 0;
  create(scope: FeatureScope) {
    this.creates++;
    let value = 0;
    scope.defer(() => {
      this.closes++;
    });
    return { read: () => ++value };
  }
}
it("isolates each contract case and cleans up every API scope", async () => {
  const implementation = new Probe();
  const result = await runContract(implementation, suite);
  assertContract(result);
  expect(result.cases.map((c) => c.status)).toEqual(["passed", "passed"]);
  expect([implementation.creates, implementation.closes]).toEqual([2, 2]);
});
it("rolls back partial initialization in reverse order and attempts every cleanup", async () => {
  const order: number[] = [];
  class Broken extends Probe {
    create(scope: FeatureScope): never {
      scope.defer(() => {
        order.push(1);
      });
      scope.defer(async () => {
        order.push(2);
        throw new Error("cleanup");
      });
      throw new Error("setup");
    }
  }
  await expect(openFeature(new Broken())).rejects.toBeInstanceOf(
    AggregateError,
  );
  expect(order).toEqual([2, 1]);
});
it("aborts the feature lifetime and shares one disposal promise", async () => {
  let signal!: AbortSignal;
  const cleanup = vi.fn();
  class Lifetime extends Probe {
    create(scope: FeatureScope) {
      signal = scope.signal;
      scope.defer(cleanup);
      return { read: () => 1 };
    }
  }
  const session = await openFeature(new Lifetime());
  const first = session.dispose();
  expect(signal.aborted).toBe(true);
  expect(session.dispose()).toBe(first);
  await first;
  expect(cleanup).toHaveBeenCalledOnce();
});
it("shares disposal with synchronous abort listeners and cleans up once", async () => {
  let signal!: AbortSignal;
  const cleanup = vi.fn(async () => {
    await Promise.resolve();
  });
  class Reentrant extends Probe {
    create(scope: FeatureScope) {
      signal = scope.signal;
      scope.defer(cleanup);
      return { read: () => 1 };
    }
  }
  const session = await openFeature(new Reentrant());
  let reentrant: Promise<void> | undefined;
  signal.addEventListener("abort", () => {
    reentrant = session.dispose();
  });
  const first = session.dispose();
  expect(reentrant).toBe(first);
  await first;
  expect(cleanup).toHaveBeenCalledOnce();
});
it("reports cleanup failures even when every assertion passed", async () => {
  class Broken extends Probe {
    create(scope: FeatureScope) {
      scope.defer(() => {
        throw new Error("cleanup");
      });
      return { read: () => 1 };
    }
  }
  const result = await runContract(new Broken(), suite);
  expect(result.errors).toHaveLength(2);
  expect(() => assertContract(result)).toThrow();
});
it("distinguishes unsupported, unavailable and failed cases without counting them as passing", async () => {
  class Partial extends FeatureImplementation<typeof feature> {
    constructor() {
      super(feature, {
        value: { status: "unsupported", reason: "outside profile" },
        fresh: { status: "supported" },
      });
    }
    create(): never {
      throw new FeatureUnavailable("missing native facility");
    }
  }
  const result = await runContract(new Partial(), suite);
  expect(result.cases.map((c) => c.status)).toEqual([
    "unsupported",
    "unavailable",
  ]);
  expect(() => assertContract(result)).toThrow();
  const failed = await runContract(new Probe(), {
    feature,
    cases: {
      value: () => {
        throw Object.create(null);
      },
      fresh: () => {},
    },
  });
  expect(failed.cases[0]).toMatchObject({
    status: "failed",
    reason: "Unprintable failure",
  });
});
it("does not initialize an entirely unsupported implementation", async () => {
  class Unsupported extends FeatureImplementation<typeof feature> {
    constructor() {
      super(feature, {
        value: { status: "unsupported", reason: "not implemented" },
        fresh: { status: "unsupported", reason: "not implemented" },
      });
    }
    create = vi.fn(() => ({ read: () => 1 }));
  }
  const implementation = new Unsupported();
  const result = await runContract(implementation, suite);
  expect(result.cases.every((c) => c.status === "unsupported")).toBe(true);
  expect(implementation.create).not.toHaveBeenCalled();
  expect(() => assertContract(result)).toThrow();
});

it("rejects a different feature identity at runtime and rejects malformed coverage", async () => {
  const duplicate = defineFeature<{ read(): number }>()("probe", [
    "value",
    "fresh",
  ]);
  await expect(
    runContract(new Probe(), { ...suite, feature: duplicate }),
  ).rejects.toThrow("must match");
  expect(
    () =>
      new (class extends FeatureImplementation<typeof feature> {
        constructor() {
          super(feature, { value: { status: "supported" } } as never);
        }
        create() {
          return { read: () => 1 };
        }
      })(),
  ).toThrow("every contract case");
});
it("cleans up a failed assertion and continues to the next case", async () => {
  const implementation = new Probe();
  const result = await runContract(implementation, {
    feature,
    cases: {
      value: () => {
        throw new Error("mismatch");
      },
      fresh: suite.cases.fresh,
    },
  });
  expect(result.cases.map((test) => test.status)).toEqual(["failed", "passed"]);
  expect(implementation.closes).toBe(2);
});

it("rolls back asynchronous setup failures and prevents late cleanup registration", async () => {
  const cleanup = vi.fn();
  let scope!: FeatureScope;
  class AsyncFailure extends FeatureImplementation<typeof feature> {
    constructor() {
      super(feature, coverage);
    }
    async create(received: FeatureScope): Promise<never> {
      scope = received;
      scope.defer(cleanup);
      await Promise.resolve();
      throw new Error("async setup failed");
    }
  }
  const implementation = new AsyncFailure();
  await expect(openFeature(implementation)).rejects.toThrow(
    "async setup failed",
  );
  expect(cleanup).toHaveBeenCalledOnce();
  expect(scope.signal.aborted).toBe(true);
  expect(() => scope.defer(() => {})).toThrow("closed");
});

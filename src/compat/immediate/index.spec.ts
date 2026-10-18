import {
  defineFeature,
  FeatureImplementation,
} from "@rdlabo/capacitor-workers/features";
import type { ContractSuite } from "@rdlabo/capacitor-workers/testing";
import { setImmediate, clearImmediate } from "./index.js";
const local = { setImmediate, clearImmediate };
export const immediateFeature = defineFeature<typeof local>()(
  "globals.immediate",
  ["callback", "cancel", "handle", "validation"],
);
const equal = (a: unknown, b: unknown) => {
  if (a !== b) throw new Error(`${a} != ${b}`);
};
const throws = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    if (error instanceof TypeError) return;
    throw error;
  }
  throw new Error("Expected TypeError");
};
export const immediateContract: ContractSuite<typeof immediateFeature> = {
  feature: immediateFeature,
  cases: {
    async callback(api) {
      let synchronous = true;
      await new Promise<void>((resolve) => {
        api.setImmediate(
          (a, b) => {
            equal(synchronous, false);
            equal(a, 1);
            equal(b, "x");
            resolve();
          },
          1,
          "x",
        );
        synchronous = false;
      });
    },
    async cancel(api) {
      let called = false;
      const handle = api.setImmediate(() => {
        called = true;
      });
      api.clearImmediate(handle);
      api.clearImmediate(handle);
      await new Promise<void>((resolve) => api.setImmediate(resolve));
      equal(called, false);
      const disposed = api.setImmediate(() => {
        called = true;
      });
      disposed[Symbol.dispose]();
      await new Promise<void>((resolve) => api.setImmediate(resolve));
      equal(called, false);
    },
    handle(api) {
      const handle = api.setImmediate(() => {});
      try {
        equal(Object.prototype.toString.call(handle), "[object Immediate]");
        equal(handle.hasRef(), false);
        equal(handle.ref(), undefined);
        equal(handle.unref(), undefined);
        equal(handle.hasRef(), false);
        equal(Object.keys(handle).length, 0);
        throws(() => Reflect.construct(handle.constructor, []));
        const forged = Object.create(Object.getPrototypeOf(handle));
        throws(() => handle.ref.call(forged));
        throws(() => handle.unref.call(forged));
        throws(() => handle.hasRef.call(forged));
        throws(() => api.clearImmediate(forged));
      } finally {
        api.clearImmediate(handle);
      }
    },
    validation(api) {
      for (const value of [undefined, null, 1, "x", {}])
        throws(() => api.setImmediate(value as never));
      for (const value of [1, "1", {}])
        throws(() => api.clearImmediate(value as never));
      throws(() => api.clearImmediate());
      api.clearImmediate(undefined);
      api.clearImmediate(null);
    },
  },
};
export class ImmediateImplementation extends FeatureImplementation<
  typeof immediateFeature
> {
  constructor(private readonly api = local) {
    super(immediateFeature, {
      callback: { status: "supported" },
      cancel: { status: "supported" },
      handle: { status: "supported" },
      validation: { status: "supported" },
    });
  }
  create() {
    return this.api;
  }
}

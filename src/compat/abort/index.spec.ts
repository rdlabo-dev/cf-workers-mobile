import {
  defineFeature,
  FeatureImplementation,
} from "@rdlabo/capacitor-workers/features";
import type { ContractSuite } from "@rdlabo/capacitor-workers/testing";
import { AbortController, AbortSignal } from "./index.js";
const api = { AbortController, AbortSignal };
const equal = (value: unknown, expected: unknown) => {
  if (value !== expected)
    throw new Error(`${String(value)} != ${String(expected)}`);
};
function throws(fn: () => unknown, reason: unknown) {
  try {
    fn();
  } catch (error) {
    equal(error, reason);
    return;
  }
  throw new Error("Expected a thrown abort reason");
}
export const abortFeature = defineFeature<typeof api>()("web.abort", [
  "controller",
  "defaultReason",
  "staticAbort",
  "any",
  "timeout",
  "validation",
]);
export const abortContract: ContractSuite<typeof abortFeature> = {
  feature: abortFeature,
  cases: {
    controller({ AbortController }) {
      const controller = new AbortController();
      const signal = controller.signal;
      equal(signal, controller.signal);
      equal(signal.aborted, false);
      equal(signal.reason, undefined);
      signal.throwIfAborted();
      const reason = { tag: 1 };
      const order: string[] = [];
      signal.addEventListener("abort", (event) => {
        equal(event.target, signal);
        equal(signal.reason, reason);
        order.push("listener");
      });
      signal.onabort = () => order.push("property");
      controller.abort(reason);
      order.push("return");
      controller.abort("other");
      equal(signal.reason, reason);
      equal(signal.aborted, true);
      equal(order.join(","), "listener,property,return");
      throws(() => signal.throwIfAborted(), reason);
    },
    defaultReason({ AbortController }) {
      const controller = new AbortController();
      controller.abort();
      equal(controller.signal.reason.name, "AbortError");
      throws(
        () => controller.signal.throwIfAborted(),
        controller.signal.reason,
      );
      const explicit = new AbortController();
      explicit.abort(null);
      equal(explicit.signal.reason, null);
    },
    staticAbort({ AbortSignal }) {
      for (const reason of [null, 0, "stop", { tag: 1 }]) {
        const signal = AbortSignal.abort(reason);
        equal(signal.reason, reason);
        equal(signal.aborted, true);
        throws(() => signal.throwIfAborted(), reason);
      }
      equal(AbortSignal.abort().reason.name, "AbortError");
    },
    any({ AbortController, AbortSignal }) {
      equal(AbortSignal.any([]).aborted, false);
      const first = new AbortController(),
        second = new AbortController();
      const combined = AbortSignal.any([
        first.signal,
        second.signal,
        first.signal,
      ]);
      let count = 0;
      combined.addEventListener("abort", () => count++);
      second.abort("second");
      first.abort("first");
      equal(combined.reason, "second");
      equal(count, 1);
      equal(AbortSignal.any([first.signal, second.signal]).reason, "first");
      const nested = AbortSignal.any([combined]);
      equal(nested.reason, "second");
    },
    async timeout({ AbortSignal }) {
      const signal = AbortSignal.timeout(-1);
      equal(signal.aborted, false);
      await new Promise<void>((resolve) =>
        signal.addEventListener("abort", () => resolve(), { once: true }),
      );
      equal(signal.aborted, true);
      equal(signal.reason.name, "TimeoutError");
      throws(() => signal.throwIfAborted(), signal.reason);
      for (const delay of [NaN, null, "0", 0.5]) {
        const normalized = AbortSignal.timeout(delay as number);
        await new Promise<void>((resolve) =>
          normalized.addEventListener("abort", () => resolve(), { once: true }),
        );
        equal(normalized.reason.name, "TimeoutError");
      }
    },
    validation({ AbortSignal }) {
      for (const fn of [
        () => new AbortSignal(),
        () => AbortSignal.any([{} as never]),
        () => AbortSignal.timeout(Symbol() as never),
      ]) {
        let failed = false;
        try {
          fn();
        } catch {
          failed = true;
        }
        equal(failed, true);
      }
    },
  },
};
export class AbortImplementation extends FeatureImplementation<
  typeof abortFeature
> {
  constructor(private readonly implementation = api) {
    super(
      abortFeature,
      Object.fromEntries(
        abortFeature.cases.map((id) => [id, { status: "supported" }]),
      ) as never,
    );
  }
  create() {
    return this.implementation;
  }
}

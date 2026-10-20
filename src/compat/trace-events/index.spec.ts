import * as builtin from "node:trace_events";
import {
  defineFeature,
  FeatureImplementation,
} from "cf-workers-mobile/shared/contracts";
import type { ContractSuite } from "cf-workers-mobile/shared/contracts/testing";
const api = builtin as unknown as typeof import("./index.js");
function same(actual: unknown, expected: unknown) {
  if (actual !== expected)
    throw new Error(`${String(actual)} != ${String(expected)}`);
}
function error(fn: () => unknown, code: string, message?: string) {
  try {
    fn();
  } catch (caught) {
    same((caught as any).code, code);
    same((caught as Error).name, "TypeError");
    if (message) same((caught as Error).message, message);
    return;
  }
  throw new Error(`Expected ${code}`);
}
export const traceEventsFeature = defineFeature<typeof api>()(
  "node.trace_events",
  [
    "surface",
    "lifecycle",
    "independentInstances",
    "categories",
    "validation",
    "inspection",
  ] as const,
);
export const traceEventsContract: ContractSuite<typeof traceEventsFeature> = {
  feature: traceEventsFeature,
  cases: {
    surface(api) {
      same(
        Object.keys(api).sort().join(),
        "createTracing,default,getEnabledCategories",
      );
      same(
        Object.keys(api.default).sort().join(),
        "createTracing,getEnabledCategories",
      );
      same(api.default.createTracing, api.createTracing);
      same(api.default.getEnabledCategories, api.getEnabledCategories);
    },
    lifecycle(api) {
      const tracing = api.createTracing({ categories: ["node", "v8"] });
      same(tracing.enabled, false);
      same(tracing.categories, "node,v8");
      same(tracing.enable(), undefined);
      same(tracing.enabled, true);
      tracing.enable();
      // Workers tracks local state, but does not enable engine tracing.
      same(api.getEnabledCategories(), undefined);
      same(tracing.disable(), undefined);
      tracing.disable();
      same(tracing.enabled, false);
    },
    independentInstances(api) {
      const a = api.createTracing({ categories: ["node"] });
      const b = api.createTracing({ categories: ["node"] });
      a.enable();
      same(b.enabled, false);
      b.enable();
      a.disable();
      same(b.enabled, true);
      b.disable();
    },
    categories(api) {
      const categories = ["", "node", "node", "a,b"];
      const tracing = api.createTracing({ categories });
      same(tracing.categories, ",node,node,a,b");
      // The pinned API deliberately retains the supplied array by reference.
      categories.push("later");
      same(tracing.categories, ",node,node,a,b,later");
      categories.length = 0;
      same(tracing.categories, "");
    },
    validation(api) {
      for (const value of [undefined, null, [], 1, "node", () => {}])
        error(() => api.createTracing(value as any), "ERR_INVALID_ARG_TYPE");
      for (const value of [
        undefined,
        null,
        "node",
        {},
        [1],
        ["node", false],
        Array(1),
      ])
        error(
          () => api.createTracing({ categories: value as any }),
          "ERR_INVALID_ARG_TYPE",
        );
      error(
        () => api.createTracing({ categories: [] }),
        "ERR_TRACE_EVENTS_CATEGORY_REQUIRED",
        "At least one category is required",
      );
    },
    inspection(api) {
      const tracing = api.createTracing({ categories: ["node"] });
      const inspect = (tracing as any)[
        Symbol.for("nodejs.util.inspect.custom")
      ];
      same(
        inspect.call(tracing),
        "Tracing { enabled: false, categories: 'node' }",
      );
      tracing.enable();
      same(
        inspect.call(tracing, 0),
        "Tracing { enabled: true, categories: 'node' }",
      );
      same(inspect.call(tracing, -1), tracing);
      tracing.disable();
    },
  },
};
export class TraceEventsImplementation extends FeatureImplementation<
  typeof traceEventsFeature
> {
  constructor() {
    super(traceEventsFeature, {
      surface: { status: "supported" },
      lifecycle: { status: "supported" },
      independentInstances: { status: "supported" },
      categories: { status: "supported" },
      validation: { status: "supported" },
      inspection: { status: "supported" },
    });
  }
  create() {
    return api;
  }
}

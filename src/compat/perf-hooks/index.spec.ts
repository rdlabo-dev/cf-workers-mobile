import * as builtin from "node:perf_hooks";
import {
  defineFeature,
  FeatureImplementation,
} from "workers-capacitor/shared/contracts";
import type { ContractSuite } from "workers-capacitor/shared/contracts/testing";
const api = builtin as unknown as typeof import("./index.js");
function same(a: unknown, b: unknown) {
  if (a !== b) throw new Error(`${String(a)} != ${String(b)}`);
}
function equal(a: unknown, b: unknown) {
  same(JSON.stringify(a), JSON.stringify(b));
}
function throws(fn: () => unknown, message: string) {
  try {
    fn();
  } catch (error) {
    same((error as Error).message, message);
    return;
  }
  throw new Error("Expected exception");
}
export const perfHooksFeature = defineFeature<typeof api>()("node.perf_hooks", [
  "surface",
  "constructors",
  "clock",
  "marks",
  "details",
  "measures",
  "namedMeasures",
  "clearing",
  "entries",
  "nodeTiming",
  "observer",
  "eventCounts",
  "stubs",
  "validation",
] as const);
export const perfHooksContract: ContractSuite<typeof perfHooksFeature> = {
  feature: perfHooksFeature,
  cases: {
    surface(api) {
      const names = [
        "Performance",
        "PerformanceEntry",
        "PerformanceMark",
        "PerformanceMeasure",
        "PerformanceObserver",
        "PerformanceObserverEntryList",
        "PerformanceResourceTiming",
        "monitorEventLoopDelay",
        "createHistogram",
        "eventLoopUtilization",
        "timerify",
        "performance",
        "constants",
      ].sort();
      equal(Object.keys(api).sort(), [...names, "default"].sort());
      equal(Object.keys(api.default).sort(), names);
      for (const key of names)
        same((api as any)[key], (api.default as any)[key]);
      for (const name of [
        "Performance",
        "PerformanceEntry",
        "PerformanceMark",
        "PerformanceMeasure",
        "PerformanceObserver",
        "PerformanceObserverEntryList",
        "PerformanceResourceTiming",
      ]) {
        const prototype = (api as any)[name].prototype;
        same(
          Object.getOwnPropertyDescriptor(prototype, Symbol.toStringTag)?.value,
          name,
        );
        for (const key of Object.getOwnPropertyNames(prototype)) {
          if (key !== "constructor")
            same(
              Object.getOwnPropertyDescriptor(prototype, key)?.enumerable,
              true,
            );
        }
      }
      same(Object.isFrozen(api.constants), true);
      same(api.constants.NODE_PERFORMANCE_GC_MAJOR, 4);
      same(api.constants.NODE_PERFORMANCE_MILESTONE_BOOTSTRAP_COMPLETE, 7);
    },
    constructors(api) {
      for (const name of [
        "Performance",
        "PerformanceEntry",
        "PerformanceMeasure",
        "PerformanceResourceTiming",
        "PerformanceObserverEntryList",
      ])
        throws(() => new (api as any)[name](), "Illegal constructor");
      const mark = new api.PerformanceMark("constructed", { startTime: 7 });
      same(mark instanceof api.PerformanceEntry, true);
      same(mark instanceof api.PerformanceMark, true);
      same(api.performance instanceof api.Performance, true);
      same(api.performance instanceof EventTarget, true);
      same(api.performance, globalThis.performance);
      for (const key of [
        "Performance",
        "PerformanceEntry",
        "PerformanceMark",
        "PerformanceMeasure",
        "PerformanceObserver",
        "PerformanceObserverEntryList",
        "PerformanceResourceTiming",
      ])
        same((api as any)[key], (globalThis as any)[key]);
      same(api.performance.getEntriesByName("constructed").length, 0);
    },
    clock(api) {
      same(api.performance.timeOrigin, 0);
      const before = Date.now();
      const now = api.performance.now();
      const after = Date.now();
      same(now >= before && now <= after, true);
      equal(api.performance.toJSON(), { timeOrigin: 0 });
      same(Object.getPrototypeOf(api.performance.toJSON()), null);
    },
    marks(api) {
      const p = api.performance;
      p.clearMarks();
      p.clearMeasures();
      try {
        const a = p.mark("late", { startTime: 9 });
        const b = p.mark("early", { startTime: -4 });
        equal(a.toJSON(), {
          name: "late",
          entryType: "mark",
          startTime: 9,
          duration: 0,
        });
        same(a.detail, null);
        same(Object.getPrototypeOf(a.toJSON()), null);
        equal(
          p.getEntries().map((e) => e.name),
          ["late", "early"],
        );
        same(p.getEntries()[1], b);
      } finally {
        p.clearMarks();
      }
    },
    details(api) {
      const detail = { value: 1 };
      const mark = new api.PerformanceMark("detail", { detail, startTime: 2 });
      same(mark.detail, detail);
      same(mark.toJSON().detail, detail);
      detail.value = 2;
      same((mark.detail as any).value, 2);
      for (const value of [null, 1, "text", true])
        throws(
          () => new api.PerformanceMark("x", { detail: value }),
          "Incorrect type for the 'detail' field on 'Options': the provided value is not of type 'Object'.",
        );
    },
    measures(api) {
      const p = api.performance;
      p.clearMeasures();
      try {
        const d = {};
        const m = p.measure("duration", { start: 3, duration: 4, detail: d });
        same(m instanceof api.PerformanceMeasure, true);
        same(m instanceof api.PerformanceEntry, true);
        same(m.detail, d);
        equal(m.toJSON(), {
          name: "duration",
          entryType: "measure",
          startTime: 3,
          duration: 4,
          detail: d,
        });
        same(p.measure("end", { start: 3, end: 9, duration: 100 }).duration, 6);
        same(p.measure("negative", { start: 9, end: 2 }).duration, 0);
        same(
          p.measure("negative-duration", { start: 9, duration: -2 }).duration,
          0,
        );
      } finally {
        p.clearMeasures();
      }
    },
    namedMeasures(api) {
      const p = api.performance;
      p.clearMarks();
      p.clearMeasures();
      try {
        p.mark("start", { startTime: 3 });
        p.mark("start", { startTime: 30 });
        p.mark("end", { startTime: 12 });
        const m = p.measure("named", "start", "end");
        same(m.startTime, 3);
        same(m.duration, 9);
        same(p.measure("missing", "absent", "end").duration, 12);
        // Object options ignore the third mark argument in this Workers profile.
        same(p.measure("options", { start: 2, end: 7 }, "end").duration, 5);
      } finally {
        p.clearMarks();
        p.clearMeasures();
      }
    },
    clearing(api) {
      const p = api.performance;
      p.clearMarks();
      p.clearMeasures();
      try {
        p.mark("same", { startTime: 1 });
        p.measure("same", { duration: 2 });
        p.clearMarks("same");
        same(p.getEntries().length, 0);
        p.mark("same", { startTime: 1 });
        p.measure("same", { duration: 2 });
        p.clearMeasures("same");
        same(p.getEntries().length, 0);
        p.mark("mark");
        p.measure("measure");
        p.clearResourceTimings();
        same(p.getEntries().length, 2);
        p.clearMarks();
        equal(
          p.getEntries().map((e) => e.entryType),
          ["measure"],
        );
      } finally {
        p.clearMarks();
        p.clearMeasures();
      }
    },
    entries(api) {
      const p = api.performance;
      p.clearMarks();
      p.clearMeasures();
      try {
        const mark = p.mark("same", { startTime: 1 });
        p.measure("same", { duration: 2 });
        same(p.getEntriesByName("same").length, 2);
        same(p.getEntriesByName("same", "mark")[0], mark);
        same(p.getEntriesByType("mark")[0], mark);
        p.getEntries().length = 0;
        same(p.getEntries().length, 2);
      } finally {
        p.clearMarks();
        p.clearMeasures();
      }
    },
    nodeTiming(api) {
      const timing = api.performance.nodeTiming;
      same(timing instanceof api.PerformanceEntry, true);
      same(timing === api.performance.nodeTiming, false);
      equal(timing.toJSON(), {
        name: "node",
        entryType: "node",
        startTime: 0,
        duration: 0,
        nodeStart: 0,
        v8Start: 0,
        bootstrapComplete: 0,
        environment: 0,
        loopStart: 0,
        loopExit: 0,
        idleTime: 0,
        uvMetricsInfo: { loopCount: 0, events: 0, eventsWaiting: 0 },
      });
    },
    async observer(api) {
      let called = false;
      const observer = new api.PerformanceObserver(() => {
        called = true;
      });
      equal(api.PerformanceObserver.supportedEntryTypes, ["measure", "mark"]);
      const types = api.PerformanceObserver.supportedEntryTypes;
      types.push("changed");
      equal(api.PerformanceObserver.supportedEntryTypes, ["measure", "mark"]);
      observer.observe({ entryTypes: ["mark"] });
      api.performance.mark("observer");
      await Promise.resolve();
      equal(observer.takeRecords(), []);
      same(called, false);
      observer.disconnect();
      api.performance.clearMarks("observer");
      for (const callback of [undefined, null, 1, "callback"]) {
        const o = new api.PerformanceObserver(callback);
        o.observe();
        o.disconnect();
        equal(o.takeRecords(), []);
      }
    },
    eventCounts(api) {
      const counts = api.performance.eventCounts;
      same(counts === api.performance.eventCounts, false);
      same(counts.size, 0);
      same(counts.get("fetch"), undefined);
      same(counts.has("fetch"), false);
      equal([...counts], []);
      equal([...counts.entries()], []);
      equal([...counts.keys()], []);
      equal([...counts.values()], []);
      let called = false;
      counts.forEach(() => {
        called = true;
      });
      same(called, false);
    },
    stubs(api) {
      equal(api.eventLoopUtilization(), { idle: 0, active: 0, utilization: 0 });
      equal(api.performance.eventLoopUtilization(), {
        idle: 0,
        active: 0,
        utilization: 0,
      });
      const fn = () => 42;
      same(api.timerify(fn), fn);
      same(api.performance.timerify(fn), fn);
      same(api.timerify(null as any), null);
      same(api.performance.markResourceTiming(), undefined);
      same(api.performance.setResourceTimingBufferSize(0), undefined);
      throws(
        api.createHistogram,
        "The createHistogram method is not implemented",
      );
      throws(
        api.monitorEventLoopDelay,
        "The monitorEventLoopDelay method is not implemented",
      );
    },
    validation(api) {
      for (const method of [
        "mark",
        "measure",
        "getEntriesByName",
        "getEntriesByType",
      ])
        throws(
          () => (api.performance as any)[method](),
          `Failed to execute '${method}' on 'Performance': parameter 1 is not of type 'string'.`,
        );
      throws(
        () => new (api.PerformanceMark as any)(),
        "Failed to construct 'PerformanceMark': constructor parameter 1 is not of type 'string'.",
      );
      throws(
        () => new api.PerformanceObserver(),
        "Failed to construct 'PerformanceObserver': constructor parameter 1 is not of type 'Value'.",
      );
      throws(
        () => new api.PerformanceMark("x", { startTime: 1n }),
        "Cannot convert a BigInt value to a number",
      );
      for (const value of [NaN, Infinity, undefined])
        throws(
          () => api.performance.setResourceTimingBufferSize(value),
          "The value cannot be converted because it is not an integer.",
        );
      throws(
        () => api.performance.setResourceTimingBufferSize(-1),
        "The value cannot be converted because it is negative and this API expects a positive number.",
      );
      throws(
        () => api.performance.setResourceTimingBufferSize(4294967296),
        "Value out of range. Must be less than or equal to 4294967295.",
      );
      same(api.performance.setResourceTimingBufferSize(0.5), undefined);
      const observer = new api.PerformanceObserver(undefined);
      throws(
        () => observer.observe(1),
        "Failed to execute 'observe' on 'PerformanceObserver': parameter 1 is not of type 'ObserveOptions'.",
      );
      throws(
        () => observer.observe({ entryTypes: "mark" }),
        "Incorrect type for the 'entryTypes' field on 'ObserveOptions': the provided value is not of type 'Array'.",
      );
      throws(
        () => observer.observe({ durationThreshold: -1 }),
        "The value cannot be converted because it is negative and this API expects a positive number.",
      );
      same(
        Object.prototype.toString.call(api.performance),
        "[object Performance]",
      );
      same(
        Object.prototype.toString.call(api.performance.nodeTiming),
        "[object PerformanceNodeTiming]",
      );
      same(
        Object.prototype.toString.call(api.performance.eventCounts),
        "[object EventCounts]",
      );

      throws(
        () => new api.PerformanceMark("x", 1),
        "Failed to construct 'PerformanceMark': constructor parameter 2 is not of type 'Options'.",
      );
      throws(
        () => api.performance.mark("x", 1),
        "Failed to execute 'mark' on 'Performance': parameter 2 is not of type 'Options'.",
      );
      throws(
        () => api.performance.timerify(1 as any),
        "Failed to execute 'timerify' on 'Performance': parameter 1 is not of type 'function'.",
      );
    },
  },
};
export class PerfHooksImplementation extends FeatureImplementation<
  typeof perfHooksFeature
> {
  constructor() {
    super(perfHooksFeature, {
      surface: { status: "supported" },
      constructors: { status: "supported" },
      clock: { status: "supported" },
      marks: { status: "supported" },
      details: { status: "supported" },
      measures: { status: "supported" },
      namedMeasures: { status: "supported" },
      clearing: { status: "supported" },
      entries: { status: "supported" },
      nodeTiming: { status: "supported" },
      observer: { status: "supported" },
      eventCounts: { status: "supported" },
      stubs: { status: "supported" },
      validation: { status: "supported" },
    });
  }
  create() {
    return api;
  }
}

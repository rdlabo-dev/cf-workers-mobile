// Port of workerd 5358e3d src/workerd/api/performance.{h,c++}.
// Copyright (c) Cloudflare, Inc. Licensed under Apache-2.0.
// Workers retains user entries but deliberately does not deliver observer callbacks.
const internal = Symbol("Performance construction");
type Detail = object | undefined;
function dictionary(
  value: unknown,
  context: string,
  type = "Options",
): Record<string, any> {
  if (value == null) return {};
  if (typeof value !== "object" && typeof value !== "function")
    throw new TypeError(`${context} is not of type '${type}'.`);
  return value as Record<string, any>;
}
function detail(value: unknown): Detail {
  if (value === undefined) return undefined;
  if (
    (typeof value !== "object" || value === null) &&
    typeof value !== "function"
  )
    throw new TypeError(
      "Incorrect type for the 'detail' field on 'Options': the provided value is not of type 'Object'.",
    );
  return value as object;
}
function primitive(value: unknown, hint: "number" | "string"): unknown {
  if (
    value === null ||
    (typeof value !== "object" && typeof value !== "function")
  )
    return value;
  const object = value as Record<PropertyKey, any>;
  const exotic = object[Symbol.toPrimitive];
  if (exotic != null) {
    if (typeof exotic !== "function")
      throw new TypeError("Cannot convert object to primitive value");
    const result = Reflect.apply(exotic, value, [hint]);
    if (
      result === null ||
      (typeof result !== "object" && typeof result !== "function")
    )
      return result;
    throw new TypeError("Cannot convert object to primitive value");
  }
  for (const key of hint === "number"
    ? ["valueOf", "toString"]
    : ["toString", "valueOf"]) {
    const method = object[key];
    if (typeof method !== "function") continue;
    const result = Reflect.apply(method, value, []);
    if (
      result === null ||
      (typeof result !== "object" && typeof result !== "function")
    )
      return result;
  }
  throw new TypeError("Cannot convert object to primitive value");
}
function numeric(value: unknown): number {
  const converted = primitive(value, "number");
  if (typeof converted === "bigint")
    throw new TypeError("Cannot convert a BigInt value to a number");
  if (typeof converted === "symbol")
    throw new TypeError("Cannot convert a Symbol value to a number");
  return Number(converted);
}
function unsigned(value: unknown) {
  const n = numeric(value);
  if (!Number.isFinite(n))
    throw new TypeError(
      "The value cannot be converted because it is not an integer.",
    );
  if (n < 0)
    throw new TypeError(
      "The value cannot be converted because it is negative and this API expects a positive number.",
    );
  if (n > 4294967295)
    throw new TypeError(
      "Value out of range. Must be less than or equal to 4294967295.",
    );
  return Math.trunc(n);
}
function required(
  count: number,
  type: string,
  method?: string,
  owner = "Performance",
) {
  if (count) return;
  const context = method
    ? `Failed to execute '${method}' on '${owner}': parameter 1`
    : `Failed to construct '${owner}': constructor parameter 1`;
  throw new TypeError(`${context} is not of type '${type}'.`);
}
function string(value: unknown) {
  const converted = primitive(value, "string");
  if (typeof converted === "symbol")
    throw new TypeError("Cannot convert a Symbol value to a string");
  return String(converted);
}
function object(values: object) {
  return Object.assign(Object.create(null), values);
}

export class PerformanceEntry {
  #name: string;
  #entryType: string;
  #startTime: number;
  #duration: number;
  constructor(
    token?: symbol,
    name = "",
    entryType = "",
    startTime = 0,
    duration = 0,
  ) {
    if (token !== internal) throw new TypeError("Illegal constructor");
    this.#name = name;
    this.#entryType = entryType;
    this.#startTime = startTime;
    this.#duration = duration;
  }
  get name() {
    return this.#name;
  }
  get entryType() {
    return this.#entryType;
  }
  get startTime() {
    return this.#startTime;
  }
  get duration() {
    return this.#duration;
  }
  toJSON() {
    return object({
      name: this.name,
      entryType: this.entryType,
      startTime: this.startTime,
      duration: this.duration,
    });
  }
}
export class PerformanceMark extends PerformanceEntry {
  #detail: Detail;
  constructor(name: unknown, options?: unknown) {
    required(arguments.length, "string", undefined, "PerformanceMark");
    const convertedName = string(name);
    const opts = dictionary(
      options,
      "Failed to construct 'PerformanceMark': constructor parameter 2",
    );
    const d = detail(opts.detail);
    const start =
      opts.startTime === undefined ? Date.now() : numeric(opts.startTime);
    super(internal, convertedName, "mark", start, 0);
    this.#detail = d;
  }
  get detail() {
    return this.#detail ?? null;
  }
  override toJSON() {
    const result = super.toJSON();
    if (this.#detail !== undefined) result.detail = this.#detail;
    return result;
  }
}
export class PerformanceMeasure extends PerformanceEntry {
  #detail: Detail;
  constructor(token?: symbol, name = "", start = 0, duration = 0, d?: object) {
    super(token, name, "measure", start, duration);
    this.#detail = d;
  }
  get detail() {
    return this.#detail ?? null;
  }
  override toJSON() {
    const result = super.toJSON();
    if (this.#detail !== undefined) result.detail = this.#detail;
    return result;
  }
}
export class PerformanceResourceTiming extends PerformanceEntry {
  get connectEnd() {
    return 0;
  }
  get connectStart() {
    return 0;
  }
  get decodedBodySize() {
    return 0;
  }
  get domainLookupEnd() {
    return 0;
  }
  get domainLookupStart() {
    return 0;
  }
  get encodedBodySize() {
    return 0;
  }
  get fetchStart() {
    return 0;
  }
  get initiatorType() {
    return "";
  }
  get nextHopProtocol() {
    return "";
  }
  get redirectEnd() {
    return 0;
  }
  get redirectStart() {
    return 0;
  }
  get requestStart() {
    return 0;
  }
  get responseEnd() {
    return 0;
  }
  get responseStart() {
    return 0;
  }
  get responseStatus() {
    return 0;
  }
  get secureConnectionStart() {
    return undefined;
  }
  get transferSize() {
    return 0;
  }
  get workerStart() {
    return 0;
  }
}
class PerformanceNodeTiming extends PerformanceEntry {
  constructor(token?: symbol) {
    if (token !== internal) throw new TypeError("Illegal constructor");
    super(internal, "node", "node", 0, 0);
    for (const name of [
      "nodeStart",
      "v8Start",
      "bootstrapComplete",
      "environment",
      "loopStart",
      "loopExit",
      "idleTime",
    ])
      Object.defineProperty(this, name, {
        configurable: true,
        enumerable: true,
        get: () => 0,
      });
    Object.defineProperty(this, "uvMetricsInfo", {
      configurable: true,
      enumerable: true,
      get: () => ({ loopCount: 0, events: 0, eventsWaiting: 0 }),
    });
  }
  override toJSON() {
    return object({
      ...super.toJSON(),
      ...this,
      uvMetricsInfo: object({ loopCount: 0, events: 0, eventsWaiting: 0 }),
    });
  }
}
export class PerformanceObserverEntryList {
  constructor() {
    throw new TypeError("Illegal constructor");
  }
  getEntries() {
    return [];
  }
  getEntriesByType(type: unknown) {
    required(
      arguments.length,
      "string",
      "getEntriesByType",
      "PerformanceObserverEntryList",
    );
    string(type);
    return [];
  }
  getEntriesByName(name: unknown, type?: unknown) {
    required(
      arguments.length,
      "string",
      "getEntriesByName",
      "PerformanceObserverEntryList",
    );
    string(name);
    if (type !== undefined) string(type);
    return [];
  }
}
export class PerformanceObserver {
  constructor(_callback?: unknown) {
    required(arguments.length, "Value", undefined, "PerformanceObserver");
  }
  disconnect() {}
  observe(options?: unknown) {
    // JSG converts the dictionary even though the native method does nothing.
    const opts = dictionary(
      options,
      "Failed to execute 'observe' on 'PerformanceObserver': parameter 1",
      "ObserveOptions",
    );
    if (opts.buffered !== undefined) Boolean(opts.buffered);
    if (opts.durationThreshold !== undefined) unsigned(opts.durationThreshold);
    if (opts.entryTypes !== undefined) {
      if (!Array.isArray(opts.entryTypes))
        throw new TypeError(
          "Incorrect type for the 'entryTypes' field on 'ObserveOptions': the provided value is not of type 'Array'.",
        );
      for (const value of opts.entryTypes) string(value);
    }
    if (opts.type !== undefined) string(opts.type);
  }
  takeRecords() {
    return [];
  }
  static get supportedEntryTypes() {
    return ["measure", "mark"];
  }
}
class EventCounts {
  constructor(token?: symbol) {
    if (token !== internal) throw new TypeError("Illegal constructor");
  }
  get size() {
    return 0;
  }
  get(type: unknown) {
    required(arguments.length, "string", "get", "EventCounts");
    string(type);
    return undefined;
  }
  has(type: unknown) {
    required(arguments.length, "string", "has", "EventCounts");
    string(type);
    return false;
  }
  *entries(): Generator<[string, number]> {}
  *keys(): Generator<string> {}
  *values(): Generator<number> {}
  forEach(callback: unknown, _thisArg?: unknown) {
    if (typeof callback !== "function")
      throw new TypeError(
        "Failed to execute 'forEach' on 'EventCounts': parameter 1 is not of type 'function'.",
      );
  }
  [Symbol.iterator]() {
    return this.entries();
  }
}
export class Performance extends EventTarget {
  #entries: PerformanceEntry[] = [];
  constructor(token?: symbol) {
    super();
    if (token !== internal) throw new TypeError("Illegal constructor");
  }
  get timeOrigin() {
    return 0;
  }
  now() {
    return Date.now();
  }
  get eventCounts() {
    return new EventCounts(internal);
  }
  get nodeTiming() {
    return new PerformanceNodeTiming(internal);
  }
  clearMarks(name?: unknown) {
    const key = name === undefined ? undefined : string(name);
    this.#entries = this.#entries.filter((e) =>
      key === undefined ? e.entryType !== "mark" : e.name !== key,
    );
  }
  clearMeasures(name?: unknown) {
    const key = name === undefined ? undefined : string(name);
    this.#entries = this.#entries.filter((e) =>
      key === undefined ? e.entryType !== "measure" : e.name !== key,
    );
  }
  clearResourceTimings() {
    this.#entries = this.#entries.filter(
      (e) => e.entryType !== "resource" && e.entryType !== "navigation",
    );
  }
  getEntries() {
    return [...this.#entries];
  }
  getEntriesByName(name: unknown, type?: unknown) {
    required(arguments.length, "string", "getEntriesByName", "Performance");
    const key = string(name);
    const kind = type === undefined ? undefined : string(type);
    return this.#entries.filter(
      (e) => e.name === key && (kind === undefined || e.entryType === kind),
    );
  }
  getEntriesByType(type: unknown) {
    required(arguments.length, "string", "getEntriesByType", "Performance");
    const kind = string(type);
    return this.#entries.filter((e) => e.entryType === kind);
  }
  mark(name: unknown, options?: unknown) {
    required(arguments.length, "string", "mark");
    const key = string(name);
    const opts = dictionary(
      options,
      "Failed to execute 'mark' on 'Performance': parameter 2",
    );
    const mark = new PerformanceMark(key, opts);
    this.#entries.push(mark);
    return mark;
  }
  measure(name: unknown, options?: unknown, endMark?: unknown) {
    required(arguments.length, "string", "measure");
    const key = string(name);
    let start = 0,
      end = Date.now(),
      d: Detail;
    if (
      options != null &&
      typeof options !== "object" &&
      typeof options !== "function"
    ) {
      options = string(options);
      start = this.getEntriesByName(options, "mark")[0]?.startTime ?? start;
      if (endMark !== undefined)
        end = this.getEntriesByName(endMark, "mark")[0]?.startTime ?? end;
    } else if (options != null) {
      const opts = dictionary(
        options,
        "Failed to execute 'measure' on 'Performance': parameter 2",
      );
      d = detail(opts.detail);
      if (opts.start !== undefined) start = numeric(opts.start);
      // The pinned dictionary converts duration even when end takes precedence.
      const duration =
        opts.duration === undefined ? undefined : numeric(opts.duration);
      if (opts.end !== undefined) end = numeric(opts.end);
      else if (duration !== undefined) end = start + duration;
      if (endMark !== undefined) string(endMark);
    }
    const entry = new PerformanceMeasure(
      internal,
      key,
      start,
      end >= start ? end - start : 0,
      d,
    );
    this.#entries.push(entry);
    return entry;
  }
  setResourceTimingBufferSize(size: unknown) {
    required(
      arguments.length,
      "unsigned integer",
      "setResourceTimingBufferSize",
    );
    unsigned(size);
  }
  toJSON() {
    return object({ timeOrigin: this.timeOrigin });
  }
  eventLoopUtilization() {
    return { idle: 0, active: 0, utilization: 0 };
  }
  markResourceTiming() {}
  timerify<T extends Function>(fn: T): T {
    if (typeof fn !== "function")
      throw new TypeError(
        "Failed to execute 'timerify' on 'Performance': parameter 1 is not of type 'function'.",
      );
    return fn;
  }
}
export const performance = new Performance(internal);

// JSG exposes Web IDL members as enumerable prototype properties.
for (const [tag, Type] of Object.entries({
  Performance,
  PerformanceEntry,
  PerformanceMark,
  PerformanceMeasure,
  PerformanceResourceTiming,
  PerformanceNodeTiming,
  PerformanceObserver,
  PerformanceObserverEntryList,
  EventCounts,
})) {
  for (const name of Object.getOwnPropertyNames(Type.prototype)) {
    if (name === "constructor") continue;
    const descriptor = Object.getOwnPropertyDescriptor(Type.prototype, name)!;
    Object.defineProperty(Type.prototype, name, {
      ...descriptor,
      enumerable: true,
    });
  }
  Object.defineProperty(Type.prototype, Symbol.toStringTag, {
    value: tag,
    configurable: true,
  });
}

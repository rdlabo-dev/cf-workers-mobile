// Shared feasibility observations, not whole-module acceptance.
export async function observeEvents(events, AsyncLocalStorage) {
  const emitter = new events.EventEmitter();
  const handler = () => {};
  emitter.on("item", handler);
  const listed = events.getEventListeners(emitter, "item");
  listed.length = 0;
  const target = new EventTarget();
  target.addEventListener("item", handler);
  const targetListeners = events.getEventListeners(target, "item").length;
  events.setMaxListeners(2, target);
  const targetMax = events.getMaxListeners(target);
  const aborted = new AbortController();
  aborted.abort("cause");
  const order = [];
  const disposed = events.addAbortListener(aborted.signal, () =>
    order.push("callback"),
  );
  disposed[Symbol.dispose]();
  order.push("sync");
  await Promise.resolve();
  const pending = new AbortController();
  let pendingCalls = 0;
  const disposable = events.addAbortListener(
    pending.signal,
    () => pendingCalls++,
  );
  disposable[Symbol.dispose]();
  pending.abort();
  const stopped = new AbortController();
  let stoppedCalls = 0;
  stopped.signal.addEventListener("abort", (event) =>
    event.stopImmediatePropagation(),
  );
  events.addAbortListener(stopped.signal, () => stoppedCalls++);
  stopped.abort();
  const als = new AsyncLocalStorage();
  const resource = als.run(
    "creation",
    () => new events.EventEmitterAsyncResource(),
  );
  let store;
  resource.on("item", () => {
    store = als.getStore();
  });
  const emitResult = als.run("dispatch", () => resource.emit("item"));
  const emptyEmitResult = resource.emit("absent");
  const iterator = events.on(emitter, "data");
  emitter.emit("data", 1, 2);
  const first = await iterator.next();
  await iterator.return();
  const iteratorCleaned =
    emitter.listenerCount("data") === 0 && emitter.listenerCount("error") === 0;
  const captureBefore = events.captureRejections;
  events.default.captureRejections = true;
  const captureAfter = events.captureRejections;
  const captureDefault = events.default.captureRejections;
  events.default.captureRejections = false;
  const sequence = [];
  const ordered = new events.EventEmitter();
  const late = () => sequence.push("late");
  ordered.on("tick", () => {
    sequence.push("first");
    ordered.removeListener("tick", late);
  });
  ordered.on("tick", late);
  ordered.prependOnceListener("tick", () => sequence.push("once"));
  ordered.emit("tick");
  ordered.emit("tick");
  const promiseEmitter = new events.EventEmitter();
  const pendingOnce = events.once(promiseEmitter, "ready");
  promiseEmitter.emit("ready", 3, 4);
  const onceValue = await pendingOnce;
  const onceCleaned =
    promiseEmitter.listenerCount("ready") === 0 &&
    promiseEmitter.listenerCount("error") === 0;
  const abort = new AbortController();
  const abortOnce = events.once(promiseEmitter, "ready", {
    signal: abort.signal,
  });
  abort.abort("cancel");
  let abortError;
  try {
    await abortOnce;
  } catch (error) {
    abortError = {
      name: error.name,
      code: error.code,
      cause: error.cause ?? null,
    };
  }
  const abortCleaned =
    promiseEmitter.listenerCount("ready") === 0 &&
    promiseEmitter.listenerCount("error") === 0;
  const rejectionEmitter = new events.EventEmitter({ captureRejections: true });
  const captured = new Promise((resolve) =>
    rejectionEmitter.once("error", (error) => resolve(error.message)),
  );
  rejectionEmitter.on("reject", async () => {
    throw new Error("captured");
  });
  rejectionEmitter.emit("reject");
  const capturedMessage = await captured;
  const errors = [];
  for (const operation of [
    () => emitter.on("x", 1),
    () => events.setMaxListeners(-1),
    () => emitter.emit("error", "failure"),
  ]) {
    try {
      operation();
    } catch (error) {
      errors.push({ name: error.name, code: error.code });
    }
  }
  return {
    sequence,
    onceValue,
    onceCleaned,
    abortError,
    abortCleaned,
    capturedMessage,
    errors,
    emitterListeners: emitter.listenerCount("item"),
    targetListeners,
    targetMax,
    order,
    pendingCalls,
    stoppedCalls,
    store,
    emitResult,
    emptyEmitResult,
    first,
    iteratorCleaned,
    captureBefore,
    captureAfter,
    captureDefault,
  };
}

export const expectedEvents = {
  sequence: ["once", "first", "late", "first"],
  onceValue: [3, 4],
  onceCleaned: true,
  abortError: { name: "AbortError", code: "ABORT_ERR", cause: null },
  abortCleaned: true,
  capturedMessage: "captured",
  errors: [
    { name: "TypeError", code: "ERR_INVALID_ARG_TYPE" },
    { name: "RangeError", code: "ERR_OUT_OF_RANGE" },
    { name: "Error", code: "ERR_UNHANDLED_ERROR" },
  ],
  emitterListeners: 1,
  targetListeners: 0,
  targetMax: 10,
  order: ["sync", "callback"],
  pendingCalls: 0,
  stoppedCalls: 0,
  store: "creation",
  emitResult: true,
  emptyEmitResult: true,
  first: { value: [1, 2], done: false },
  iteratorCleaned: true,
  captureBefore: false,
  captureAfter: false,
  captureDefault: true,
};

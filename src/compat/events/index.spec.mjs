// Differential operations against the pinned Workers profile. These cases do
// not certify async_hooks, warnings/process integration or native acceptance.
export const eventCases = {
  warningDelivery: async ({ process }) => {
    const warnings = [];
    const order = [];
    const original = Object.assign(new Error("original"), { marker: true });
    const listener = function (value) {
      order.push("warning");
      warnings.push({
        receiver: this === process,
        original: value === original,
        name: value.name,
        message: value.message,
        code: value.code ?? null,
        detail: value.detail ?? null,
      });
    };
    process.on("warning", listener);
    try {
      process.emitWarning(original);
      process.emitWarning("text", {
        type: "CustomWarning",
        code: "CUSTOM",
        detail: "detail",
      });
      order.push("sync");
      queueMicrotask(() => order.push("microtask"));
      await new Promise((resolve) => setTimeout(resolve, 0));
      const errors = [];
      for (const run of [
        () => process.emitWarning(1),
        () => process.emitWarning("text", 1),
        () => process.emitWarning("text", "Warning", 1),
      ]) {
        try {
          run();
        } catch (error) {
          errors.push({ name: error.name, code: error.code });
        }
      }
      return { warnings, order, errors };
    } finally {
      process.removeListener("warning", listener);
    }
  },
  nextTickOrdering: async ({ process }) => {
    const order = [];
    process.nextTick((a, b) => order.push(a + b), 1, 2);
    Promise.resolve().then(() => order.push("promise"));
    queueMicrotask(() => order.push("microtask"));
    order.push("sync");
    await new Promise((resolve) => setTimeout(resolve, 0));
    return order;
  },
  warnings: async ({ events: e, process }) => {
    const warnings = [];
    const listener = (value) =>
      warnings.push({
        name: value.name,
        type: String(value.type),
        count: value.count,
      });
    process.on("warning", listener);
    const logs = [];
    const oldLog = console.log;
    const oldWarn = console.warn;
    const capture = (...args) =>
      logs.push(
        args.map((value) =>
          typeof value === "string"
            ? value
            : {
                name: value.name,
                message: value.message,
                type: String(value.type),
                count: value.count,
              },
        ),
      );
    console.log = capture;
    console.warn = capture;
    try {
      const emitter = new e.EventEmitter();
      emitter.setMaxListeners(1);
      emitter.on("item", () => {});
      emitter.on("item", () => {});
      emitter.on("item", () => {});
      await new Promise((resolve) => setTimeout(resolve, 0));
      return { logs, warnings, count: emitter.listenerCount("item") };
    } finally {
      console.log = oldLog;
      console.warn = oldWarn;
      process.removeListener("warning", listener);
    }
  },
  listeners: async ({ events: e }) => {
    const emitter = new e.EventEmitter();
    const calls = [];
    function listener(...args) {
      calls.push([this === emitter, ...args]);
    }
    const symbol = Symbol("item");
    const chain = [
      emitter.on(symbol, listener),
      emitter.addListener(symbol, listener),
      emitter.prependListener(symbol, listener),
      emitter.once("once", listener),
      emitter.prependOnceListener("once", listener),
    ].every((x) => x === emitter);
    const before = [
      emitter.listenerCount(symbol),
      e.listenerCount(emitter, symbol),
      emitter.listeners("once").every((x) => x === listener),
      emitter.rawListeners("once").every((x) => x.listener === listener),
      emitter.eventNames().map(String),
    ];
    const emitted = [
      emitter.emit(symbol, 1),
      emitter.emit("once", 2),
      emitter.emit("once", 3),
    ];
    emitter.off(symbol, listener);
    emitter.removeListener(symbol, listener);
    const after = emitter.listenerCount(symbol);
    const removed = emitter.removeAllListeners() === emitter;
    return {
      chain,
      before,
      emitted,
      calls,
      after,
      removed,
      names: emitter.eventNames(),
    };
  },
  listenerMutation: async ({ events: e }) => {
    const emitter = new e.EventEmitter();
    const log = [];
    const second = () => log.push("second");
    emitter.on("newListener", (name) => log.push(`add:${String(name)}`));
    emitter.on("removeListener", (name) => log.push(`remove:${String(name)}`));
    emitter.on("item", () => {
      log.push("first");
      emitter.removeListener("item", second);
    });
    emitter.on("item", second);
    emitter.emit("item");
    emitter.emit("item");
    emitter.removeAllListeners("item");
    emitter.removeAllListeners();
    return { log, count: emitter.eventNames().length };
  },
  defaults: async ({ events: e }) => {
    const original = e.default.defaultMaxListeners;
    const capture = e.default.captureRejections;
    try {
      e.setMaxListeners(7);
      const a = new e.EventEmitter();
      const b = new e.EventEmitter();
      const inherited = [a.getMaxListeners(), e.defaultMaxListeners];
      e.setMaxListeners(3, a, b);
      const configured = [
        e.getMaxListeners(a),
        b.getMaxListeners(),
        a.setMaxListeners(0) === a,
        a.getMaxListeners(),
      ];
      const target = new EventTarget();
      e.setMaxListeners(2, target);
      e.default.captureRejections = true;
      return {
        inherited,
        configured,
        targetMax: e.getMaxListeners(target),
        targetListeners: e.getEventListeners(target, "x"),
        capture: [e.captureRejections, e.default.captureRejections],
        domains: e.usingDomains,
        rejectionKey: Symbol.keyFor(e.captureRejectionSymbol),
      };
    } finally {
      e.default.defaultMaxListeners = original;
      e.default.captureRejections = capture;
    }
  },
  invalidInputs: async ({ events: e }) => {
    const emitter = new e.EventEmitter();
    const errors = [];
    const operations = [
      () => emitter.on("x", 1),
      () => emitter.once("x", null),
      () => emitter.prependListener("x", false),
      () => emitter.prependOnceListener("x", {}),
      () => emitter.removeListener("x", 4),
      () => emitter.setMaxListeners(-1),
      () => e.setMaxListeners(NaN),
      () => {
        e.default.defaultMaxListeners = -1;
      },
      () => {
        e.default.captureRejections = 1;
      },
      () => new e.EventEmitter({ captureRejections: "yes" }),
      () => e.getEventListeners({}, "x"),
      () => e.setMaxListeners(1, {}),
      () => e.addAbortListener(undefined, () => {}),
      () => e.addAbortListener(new AbortController().signal, 1),
      () => e.once(emitter, "x", 1),
      () => e.on(emitter, "x", { signal: 1 }),
    ];
    for (const run of operations) {
      try {
        await run();
        errors.push(null);
      } catch (error) {
        errors.push({
          name: error.name,
          code: error.code,
          message: error.message,
        });
      }
    }
    return errors;
  },
  errorMonitor: async ({ events: e }) => {
    const emitter = new e.EventEmitter();
    const log = [];
    const error = new Error("failure");
    emitter.on(e.errorMonitor, (value) =>
      log.push(["monitor", value === error]),
    );
    let thrown;
    try {
      emitter.emit("error", error);
    } catch (value) {
      thrown = value === error;
    }
    emitter.on("error", (value) => log.push(["handler", value === error]));
    const emitted = emitter.emit("error", error);
    return { log, thrown, emitted };
  },
  once: async ({ events: e }) => {
    const emitter = new e.EventEmitter();
    const first = e.once(emitter, "item");
    emitter.emit("item", 1, 2);
    const value = await first;
    const second = e.once(emitter, "item");
    emitter.emit("error", new Error("rejected"));
    let error;
    try {
      await second;
    } catch (value) {
      error = value.message;
    }
    const target = new EventTarget();
    const third = e.once(target, "item");
    target.dispatchEvent(new Event("item"));
    const targetValue = (await third).map((value) => value.type);
    return { value, error, targetValue, listeners: emitter.eventNames() };
  },
  onceAbort: async ({ events: e }) => {
    const results = [];
    for (const alreadyAborted of [true, false]) {
      const emitter = new e.EventEmitter();
      const controller = new AbortController();
      if (alreadyAborted) controller.abort("reason");
      const promise = e.once(emitter, "item", { signal: controller.signal });
      if (!alreadyAborted) controller.abort("reason");
      try {
        await promise;
      } catch (error) {
        results.push({
          name: error.name,
          code: error.code,
          cause: error.cause ?? null,
          listeners: emitter.eventNames(),
        });
      }
    }
    return results;
  },
  iteratorQueue: async ({ events: e }) => {
    const emitter = new e.EventEmitter();
    const iterator = e.on(emitter, "item");
    const identity = iterator[Symbol.asyncIterator]() === iterator;
    emitter.emit("item", 1);
    emitter.emit("item", 2, 3);
    const values = [await iterator.next(), await iterator.next()];
    const pending = [iterator.next(), iterator.next()];
    const returned = await iterator.return();
    return {
      identity,
      values,
      returned,
      pending: await Promise.all(pending),
      next: await iterator.next(),
      listeners: emitter.eventNames(),
    };
  },
  iteratorError: async ({ events: e }) => {
    const result = [];
    for (const pending of [true, false]) {
      const emitter = new e.EventEmitter();
      const iterator = e.on(emitter, "item");
      const next = pending ? iterator.next() : null;
      emitter.emit("error", new Error("failure"));
      let message;
      try {
        await (next ?? iterator.next());
      } catch (error) {
        message = error.message;
      }
      result.push({
        message,
        next: await iterator.next(),
        listeners: emitter.eventNames(),
      });
    }
    return result;
  },
  iteratorThrow: async ({ events: e }) => {
    const emitter = new e.EventEmitter();
    const iterator = e.on(emitter, "item");
    let invalid;
    try {
      iterator.throw("bad");
    } catch (error) {
      invalid = error.code;
    }
    const returned = iterator.throw(new Error("thrown"));
    let message;
    try {
      await iterator.next();
    } catch (error) {
      message = error.message;
    }
    await iterator.return();
    return { invalid, returned, message, listeners: emitter.eventNames() };
  },
  iteratorAbort: async ({ events: e }) => {
    const emitter = new e.EventEmitter();
    const controller = new AbortController();
    const iterator = e.on(emitter, "item", { signal: controller.signal });
    const pending = iterator.next();
    controller.abort();
    let code;
    try {
      await pending;
    } catch (error) {
      code = error.code;
    }
    let already;
    try {
      e.on(emitter, "item", { signal: controller.signal });
    } catch (error) {
      already = error.code;
    }
    return {
      code,
      already,
      done: await iterator.next(),
      listeners: emitter.eventNames(),
    };
  },
  rejectionHook: async ({ events: e }) => {
    const emitter = new e.EventEmitter({ captureRejections: true });
    const captured = new Promise((resolve) => {
      emitter[e.captureRejectionSymbol] = function (error, event, ...args) {
        resolve({
          receiver: this === emitter,
          message: error.message,
          event,
          args,
        });
      };
    });
    emitter.on("item", async () => {
      throw new Error("rejection");
    });
    emitter.emit("item", 1, 2);
    return captured;
  },
  resourceConcurrency: async ({ events: e, AsyncLocalStorage }) => {
    const als = new AsyncLocalStorage();
    const resources = ["a", "b"].map((value) =>
      als.run(value, () => new e.EventEmitterAsyncResource()),
    );
    const completions = resources.map(
      (emitter, i) =>
        new Promise((resolve) => {
          emitter.on("item", async () => {
            const before = als.getStore();
            await Promise.resolve();
            const afterPromise = als.getStore();
            await new Promise((done) => setTimeout(done, i));
            resolve([before, afterPromise, als.getStore()]);
          });
        }),
    );
    als.run("caller", () => {
      for (const resource of resources) resource.emit("item");
    });
    return {
      values: await Promise.all(completions),
      restored: als.getStore() ?? null,
    };
  },
  resource: async ({ events: e, AsyncLocalStorage }) => {
    const als = new AsyncLocalStorage();
    const emitter = als.run("created", () => new e.EventEmitterAsyncResource());
    const seen = [];
    emitter.on("item", function (value) {
      seen.push([als.getStore(), this === emitter, value]);
    });
    const emitted = als.run("caller", () => emitter.emit("item", 4));
    return {
      seen,
      emitted,
      empty: emitter.emit("absent"),
      owner: emitter.asyncResource.eventEmitter === emitter,
      id: emitter.asyncResource.asyncId(),
      trigger: emitter.asyncResource.triggerAsyncId(),
      restored: als.getStore() ?? null,
    };
  },
};

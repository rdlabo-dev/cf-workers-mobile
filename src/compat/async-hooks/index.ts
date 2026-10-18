import * as hooks from "./hooks.js";
export * from "./hooks.js";
import { contextAware, addCallbackBinding } from "./callbacks.js";
// Scoped AsyncLocalStorage implementation. Exact within synchronous scopes.
// For callbacks returning promises, run/exit install a "sticky" context
// that survives settle until another scope overwrites it: awaits inside a
// serialized request see the store, including lazily scheduled render work
// (React microtasks, MessageChannel tasks and stream pulls are wrapped to
// capture the context at schedule/construction time). Engine async hooks
// (workerd) or a whole-program async transform are required for real
// continuation isolation — concurrent interleaved request contexts are NOT
// isolated; serialize dispatch when isolation is needed. Only patch worker
// realms: the document's fetch adapter uses MessageChannel itself, so
// replacing its ports can prevent responses from arriving.

const storageInstances = new WeakSet<object>();
const resourceInstances = new WeakSet<object>();
const illegalInvocation =
  "Illegal invocation: function called with incorrect `this` reference. See https://developers.cloudflare.com/workers/observability/errors/#illegal-invocation-errors for details.";
function brand(instances: WeakSet<object>, value: object): void {
  if (!instances.has(value)) throw new TypeError(illegalInvocation);
}

type Context = Map<AsyncLocalStorage<unknown>, unknown>;
let current: Context | undefined;

function withContext<T, A extends unknown[]>(
  context: Context | undefined,
  callback: (...args: A) => T,
  args: A,
): T {
  const previous = current;
  current = context;
  try {
    return Reflect.apply(callback, globalThis, args);
  } finally {
    current = previous;
  }
}

function scope<T, A extends unknown[]>(
  context: Context,
  callback: (...args: A) => T,
  args: A,
): T {
  const previous = current;
  current = context;
  let result: T;
  try {
    result = Reflect.apply(callback, globalThis, args);
  } catch (error) {
    current = previous;
    throw error;
  }
  if (
    result !== null &&
    (typeof result === "object" || typeof result === "function") &&
    typeof (result as unknown as PromiseLike<T>).then === "function"
  ) {
    // Sticky context: the context stays installed after the returned
    // promise settles. Workers engines restore via async hooks and
    // propagate store to continuations registered inside the scope; this
    // approximation instead keeps the last context visible until another
    // scope overwrites it, which covers serialized single-request flows
    // (verified against an OpenNext handler). Divergence: getStore after
    // an awaited run returns the stale store rather than undefined.
    void previous;
  } else {
    current = previous;
  }
  return result;
}

const capture = () => (current === undefined ? undefined : new Map(current));

addCallbackBinding((callback) => {
  const context = capture();
  return function (this: unknown, ...args: unknown[]) {
    return withContext(context, () => Reflect.apply(callback, this, args), []);
  };
});

export class AsyncLocalStorage<Store = unknown> {
  readonly #defaultValue: Store | undefined;
  readonly #name: string;
  constructor(options?: { defaultValue?: Store; name?: string }) {
    if (
      options != null &&
      typeof options !== "object" &&
      typeof options !== "function"
    )
      throw new TypeError(
        "Failed to construct 'AsyncLocalStorage': constructor parameter 1 is not of type 'AsyncLocalStorageOptions'.",
      );
    this.#defaultValue = options?.defaultValue;
    const name = options?.name;
    this.#name = name == null ? "" : stringValue(name);
    storageInstances.add(this);
    // An unused import must not mutate timer/global ownership. Install only
    // when a Worker actually starts using context propagation.
    if (typeof document === "undefined") installAsyncContextPropagation();
  }

  get name() {
    brand(storageInstances, this);
    return this.#name;
  }

  static bind<Args extends unknown[], T>(
    callback: (...args: Args) => T,
  ): (...args: Args) => T {
    functionArgument(callback, "bind", "AsyncLocalStorage", 1, "Function");
    const context = capture();
    return (...args: Args) => withContext(context, callback, args);
  }

  static snapshot() {
    const context = capture();
    return <Args extends unknown[], T>(
      callback: (...args: Args) => T,
      ...args: Args
    ): T => withContext(context, callback, args);
  }

  disable(): void {
    brand(storageInstances, this);
    throw new Error("asyncLocalStorage.disable() is not implemented");
  }

  getStore(): Store | undefined {
    brand(storageInstances, this);
    return current?.has(this as AsyncLocalStorage<unknown>)
      ? (current.get(this as AsyncLocalStorage<unknown>) as Store | undefined)
      : this.#defaultValue;
  }

  enterWith(_store: Store): never {
    brand(storageInstances, this);
    throw new Error("asyncLocalStorage.enterWith() is not implemented");
  }

  run<Args extends unknown[], T>(
    store: Store,
    callback: (...args: Args) => T,
    ...args: Args
  ): T {
    brand(storageInstances, this);
    functionArgument(callback, "run", "AsyncLocalStorage", 2, "function");
    const context = capture() ?? new Map();
    context.set(this as AsyncLocalStorage<unknown>, store);
    return scope(context, callback, args);
  }

  exit<Args extends unknown[], T>(
    callback: (...args: Args) => T,
    ...args: Args
  ): T {
    brand(storageInstances, this);
    functionArgument(callback, "exit", "AsyncLocalStorage", 1, "function");
    const context = capture() ?? new Map();
    context.set(this as AsyncLocalStorage<unknown>, undefined);
    return scope(context, callback, args);
  }
}

let propagated = false;
/** Patch Promise/timers/microtasks once per realm. Safe to call repeatedly. */
function installAsyncContextPropagation(): void {
  if (propagated) return;
  propagated = true;
  const then = Promise.prototype.then;
  Promise.prototype.then = function <T, R1 = T, R2 = never>(
    this: Promise<T>,
    onFulfilled?: ((value: T) => R1 | PromiseLike<R1>) | null,
    onRejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): Promise<R1 | R2> {
    const context = capture();
    const wrap = <V, R>(fn?: ((value: V) => R) | null) =>
      typeof fn === "function"
        ? (value: V) => withContext(context, fn, [value])
        : fn;
    return then.call(this, wrap(onFulfilled), wrap(onRejected)) as Promise<
      R1 | R2
    >;
  };
  const wrapCallback = <F extends (...args: never[]) => unknown>(
    schedule: F,
  ): F =>
    ((
      callback: ((...args: unknown[]) => unknown) | undefined,
      ...args: unknown[]
    ) => {
      const context = capture();
      return Reflect.apply(schedule, undefined, [
        typeof callback === "function"
          ? (...cbArgs: unknown[]) => withContext(context, callback, cbArgs)
          : callback,
        ...args,
      ]);
    }) as unknown as F;
  globalThis.queueMicrotask = wrapCallback(globalThis.queueMicrotask);
  // Compat timers capture at scheduling time without changing global identity.
  // Retain the host fallback for environments without the Node timer adapter.
  for (const name of ["setTimeout", "setInterval", "setImmediate"] as const) {
    const schedule = globalThis[name];
    if (
      typeof schedule === "function" &&
      !(schedule as unknown as Record<symbol, unknown>)[contextAware]
    )
      (globalThis as unknown as Record<string, unknown>)[name] =
        wrapCallback(schedule);
  }
  // Stream pulls/writes run continuations after their creating scope
  // settled; wrap source/sink callbacks with the context at construction.
  const wrapMethods =
    (names: string[]) =>
    <T>(source: T): T => {
      if (source === null || typeof source !== "object") return source;
      const context = capture();
      const wrapped = Object.create(Object.getPrototypeOf(source));
      for (const name of [...Object.getOwnPropertyNames(source), ...names]) {
        const fn = (source as Record<string, unknown>)[name];
        wrapped[name] =
          names.includes(name) && typeof fn === "function"
            ? (...args: unknown[]) =>
                withContext(context, fn as (...a: unknown[]) => unknown, args)
            : fn;
      }
      return wrapped;
    };
  const NativeReadableStream = globalThis.ReadableStream;
  if (typeof NativeReadableStream === "function") {
    const wrapSource = wrapMethods(["pull", "cancel", "start"]);
    globalThis.ReadableStream = class extends (NativeReadableStream as new (
      source?: unknown,
      strategy?: QueuingStrategy,
    ) => ReadableStream) {
      constructor(source?: unknown, strategy?: QueuingStrategy) {
        super(wrapSource(source) as UnderlyingSource | undefined, strategy);
      }
    } as typeof ReadableStream;
  }
  const NativeWritableStream = globalThis.WritableStream;
  if (typeof NativeWritableStream === "function") {
    const wrapSink = wrapMethods(["write", "close", "abort", "start"]);
    globalThis.WritableStream = class extends (NativeWritableStream as new (
      sink?: unknown,
      strategy?: QueuingStrategy,
    ) => WritableStream) {
      constructor(sink?: unknown, strategy?: QueuingStrategy) {
        super(wrapSink(sink) as UnderlyingSink | undefined, strategy);
      }
    } as typeof WritableStream;
  }
  // Schedulers such as React's use MessageChannel; deliver each posted
  // message to its listeners under the context captured at postMessage.
  const NativeMessageChannel = globalThis.MessageChannel;
  if (typeof NativeMessageChannel === "function") {
    globalThis.MessageChannel = class {
      readonly port1: MessagePort;
      readonly port2: MessagePort;
      constructor() {
        const channel = new NativeMessageChannel();
        // Context queues are per receiving port; postMessage on the peer
        // captures the sender's context at send time.
        const queues = new WeakMap<MessagePort, (Context | undefined)[]>();
        const wrapSend = (send: MessagePort, receive: MessagePort) => {
          const queue: (Context | undefined)[] = [];
          queues.set(receive, queue);
          const post = send.postMessage.bind(send);
          (send as { postMessage: unknown }).postMessage = (
            ...args: unknown[]
          ) => {
            queue.push(capture());
            return Reflect.apply(post, send, args);
          };
        };
        const wrapReceive = (port: MessagePort) => {
          const queue = queues.get(port);
          const pop = () => queue?.shift();
          const addEventListener = port.addEventListener.bind(port);
          port.addEventListener = ((
            type: string,
            listener: EventListenerOrEventListenerObject | null,
            options?: unknown,
          ) => {
            if (
              (type === "message" || type === "messageerror") &&
              typeof listener === "function"
            )
              listener = (event: Event) =>
                withContext(pop(), listener as (e: Event) => void, [event]);
            return addEventListener(
              type,
              listener as EventListenerOrEventListenerObject,
              options as boolean | AddEventListenerOptions | undefined,
            );
          }) as typeof port.addEventListener;
          let handler: ((event: MessageEvent) => void) | null = null;
          addEventListener("message", (event) => {
            if (handler)
              return withContext(pop(), handler as (e: Event) => void, [event]);
          });
          for (const name of ["onmessage", "onmessageerror"] as const) {
            let stored: unknown = null;
            Object.defineProperty(port, name, {
              configurable: true,
              enumerable: true,
              get: () => stored,
              set: (value) => {
                stored = value;
                if (name === "onmessage" && typeof value === "function")
                  handler = value as (event: MessageEvent) => void;
              },
            });
          }
        };
        wrapSend(channel.port2, channel.port1);
        wrapSend(channel.port1, channel.port2);
        wrapReceive(channel.port1);
        wrapReceive(channel.port2);
        this.port1 = channel.port1;
        this.port2 = channel.port2;
      }
    } as unknown as typeof MessageChannel;
  }
}
// AsyncResource preserves the synchronous Workers API and its zero-valued
// resource IDs. Context continuation isolation retains the engine limitations
// documented above.
export class AsyncResource {
  readonly #context: Context | undefined;
  constructor(type?: string, options?: { triggerAsyncId?: number }) {
    if (type != null) stringValue(type);
    if (
      options != null &&
      typeof options !== "object" &&
      typeof options !== "function"
    )
      throw new TypeError(
        "Failed to construct 'AsyncResource': constructor parameter 2 is not of type 'Options'.",
      );
    if (options?.triggerAsyncId !== undefined)
      throw new Error(
        "The 'triggerAsyncId' field on 'Options' is not implemented.",
      );
    this.#context = capture();
    resourceInstances.add(this);
  }
  bind<F extends (...args: any[]) => any>(fn: F, thisArg?: unknown): F {
    brand(resourceInstances, this);
    functionArgument(fn, "bind", "AsyncResource", 1, "Function");
    const context = this.#context;
    const bound = (...args: any[]) =>
      withContext(
        context,
        () =>
          Reflect.apply(fn, thisArg === undefined ? globalThis : thisArg, args),
        [],
      );
    Object.defineProperty(bound, "name", { value: "", configurable: true });
    Object.assign(bound, { asyncResource: this });
    return bound as F;
  }
  runInAsyncScope<F extends (...args: any[]) => any>(
    fn: F,
    thisArg?: unknown,
    ...args: any[]
  ): ReturnType<F> {
    brand(resourceInstances, this);
    functionArgument(fn, "runInAsyncScope", "AsyncResource", 1, "function");
    const context = this.#context;
    return withContext(
      context,
      () =>
        Reflect.apply(
          fn,
          thisArg === undefined ? globalThis : thisArg,
          args,
        ) as ReturnType<F>,
      [],
    );
  }
  static bind<F extends (...args: any[]) => any>(
    fn: F,
    type?: string,
    thisArg?: unknown,
  ): F {
    functionArgument(fn, "bind", "AsyncResource", 1, "Function");
    return new AsyncResource(type).bind(fn, thisArg);
  }
  emitDestroy(): void {
    brand(resourceInstances, this);
  }
  asyncId(): number {
    brand(resourceInstances, this);
    return 0;
  }
  triggerAsyncId(): number {
    brand(resourceInstances, this);
    return 0;
  }
}

export default { AsyncLocalStorage, AsyncResource, ...hooks };

function stringValue(value: unknown): string {
  if (typeof value === "symbol")
    throw new TypeError("Cannot convert a Symbol value to a string");
  return `${value}`;
}
function functionArgument(
  value: unknown,
  method: string,
  owner: string,
  parameter: number,
  type: string,
): void {
  if (typeof value !== "function")
    throw new TypeError(
      `Failed to execute '${method}' on '${owner}': parameter ${parameter} is not of type '${type}'.`,
    );
}

for (const [name, Type] of Object.entries({
  AsyncLocalStorage,
  AsyncResource,
})) {
  Object.defineProperty(Type, "name", { value: name, configurable: true });
  Object.defineProperty(Type.prototype, Symbol.toStringTag, {
    value: name,
    configurable: true,
  });
  for (const key of Object.getOwnPropertyNames(Type.prototype)) {
    if (key !== "constructor")
      Object.defineProperty(Type.prototype, key, {
        ...Object.getOwnPropertyDescriptor(Type.prototype, key),
        enumerable: true,
      });
  }
}

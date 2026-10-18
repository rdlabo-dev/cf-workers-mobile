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
    return Reflect.apply(callback, undefined, args);
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
    result = Reflect.apply(callback, undefined, args);
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

export class AsyncLocalStorage<Store = unknown> {
  static bind<Args extends unknown[], T>(
    callback: (...args: Args) => T,
  ): (...args: Args) => T {
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
    current?.delete(this as AsyncLocalStorage<unknown>);
  }

  getStore(): Store | undefined {
    return current?.get(this as AsyncLocalStorage<unknown>) as
      | Store
      | undefined;
  }

  enterWith(store: Store): void {
    if (current === undefined) current = new Map();
    current.set(this as AsyncLocalStorage<unknown>, store);
  }

  run<Args extends unknown[], T>(
    store: Store,
    callback: (...args: Args) => T,
    ...args: Args
  ): T {
    const context = capture() ?? new Map();
    context.set(this as AsyncLocalStorage<unknown>, store);
    return scope(context, callback, args);
  }

  exit<Args extends unknown[], T>(
    callback: (...args: Args) => T,
    ...args: Args
  ): T {
    const context = capture() ?? new Map();
    context.delete(this as AsyncLocalStorage<unknown>);
    return scope(context, callback, args);
  }
}

let propagated = false;
/** Patch Promise/timers/microtasks once per realm. Safe to call repeatedly. */
export function installAsyncContextPropagation(): void {
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
  const wrapCallback =
    <F extends (...args: never[]) => unknown>(schedule: F): F =>
    ((
      callback: ((...args: unknown[]) => unknown) | undefined,
      ...args: unknown[]
    ) => {
      const context = capture();
      return Reflect.apply(schedule, undefined, [
        typeof callback === "function"
          ? () => withContext(context, callback, [])
          : callback,
        ...args,
      ]);
    }) as unknown as F;
  globalThis.queueMicrotask = wrapCallback(globalThis.queueMicrotask);
  globalThis.setTimeout = wrapCallback(
    globalThis.setTimeout,
  ) as typeof setTimeout;
  globalThis.setInterval = wrapCallback(
    globalThis.setInterval,
  ) as typeof setInterval;
  if (typeof globalThis.setImmediate === "function")
    globalThis.setImmediate = wrapCallback(
      globalThis.setImmediate,
    ) as typeof setImmediate;
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
    globalThis.ReadableStream = class extends (
      NativeReadableStream as new (
        source?: unknown,
        strategy?: QueuingStrategy,
      ) => ReadableStream
    ) {
      constructor(source?: unknown, strategy?: QueuingStrategy) {
        super(wrapSource(source) as UnderlyingSource | undefined, strategy);
      }
    } as typeof ReadableStream;
  }
  const NativeWritableStream = globalThis.WritableStream;
  if (typeof NativeWritableStream === "function") {
    const wrapSink = wrapMethods(["write", "close", "abort", "start"]);
    globalThis.WritableStream = class extends (
      NativeWritableStream as new (
        sink?: unknown,
        strategy?: QueuingStrategy,
      ) => WritableStream
    ) {
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
if (typeof document === "undefined") installAsyncContextPropagation();

// AsyncResource is intentionally minimal: bind/runInAsyncScope capture and
// restore this implementation's context, matching Workers' synchronous
// boundary. Hook ids, emitInit/emitBefore/emitAfter and real async tracking
// are not provided.
export class AsyncResource {
  readonly #context = capture();
  readonly #type: string;
  constructor(type: string, _options?: { triggerAsyncId?: number }) {
    this.#type = type;
  }
  get type() {
    return this.#type;
  }
  bind<F extends (...args: any[]) => any>(fn: F, thisArg?: unknown): F {
    const context = this.#context;
    return function (this: unknown, ...args: any[]) {
      return withContext(
        context,
        () => Reflect.apply(fn, thisArg ?? this, args),
        [],
      );
    } as F;
  }
  runInAsyncScope<F extends (...args: any[]) => any>(
    fn: F,
    thisArg?: unknown,
    ...args: any[]
  ): ReturnType<F> {
    const context = this.#context;
    return withContext(
      context,
      () => Reflect.apply(fn, thisArg, args) as ReturnType<F>,
      [],
    );
  }
  static bind<F extends (...args: any[]) => any>(
    fn: F,
    _type?: string,
    thisArg?: unknown,
  ): F {
    const context = capture();
    return function (this: unknown, ...args: any[]) {
      return withContext(
        context,
        () => Reflect.apply(fn, thisArg ?? this, args),
        [],
      );
    } as F;
  }
  emitDestroy(): this {
    return this;
  }
  asyncId(): number {
    return 0;
  }
  triggerAsyncId(): number {
    return 0;
  }
}

export default { AsyncLocalStorage, AsyncResource };

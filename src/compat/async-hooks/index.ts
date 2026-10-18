import { contextAware, addCallbackBinding } from "./callbacks.js";
import { getExecutionEnvironment } from "../../environment.js";
// Context propagation uses synchronous scopes and captured Promise callbacks.
// Native await bypasses Promise.then: browser builds must lower async functions
// with the supplied build plugins. Reject untransformed async scope callbacks
// before they can silently read another request's store.

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
  if (Object.prototype.toString.call(callback) === "[object AsyncFunction]")
    throw new Error(
      "AsyncLocalStorage requires async/await lowering by the capacitor-workers build plugin; native async callbacks are unsupported.",
    );
  return withContext(context, callback, args);
}

const capture = () => (current === undefined ? undefined : new Map(current));

addCallbackBinding((callback) => {
  const context = capture();
  return function (this: unknown, ...args: unknown[]) {
    return withContext(context, () => Reflect.apply(callback, this, args), []);
  };
});

export class AsyncLocalStorage<Store = unknown> {
  constructor() {
    // An unused import must not mutate timer/global ownership. Install only
    // when a Worker actually starts using context propagation.
    installAsyncContextPropagation();
  }

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
  if (propagated || getExecutionEnvironment() === "cloudflare-workers") return;
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
                withContext(context, () => Reflect.apply(fn, source, args), [])
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
      static [Symbol.hasInstance](value: unknown) {
        return value instanceof NativeReadableStream;
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
      static [Symbol.hasInstance](value: unknown) {
        return value instanceof NativeWritableStream;
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
            try {
              return Reflect.apply(post, send, args);
            } catch (error) {
              queue.pop();
              throw error;
            }
          };
        };
        const wrapReceive = (port: MessagePort) => {
          const queue = queues.get(port)!;
          const add = port.addEventListener.bind(port);
          // One context per message, shared by every listener for that event.
          const contexts = new WeakMap<Event, Context | undefined>();
          add("message", (event) => contexts.set(event, queue.shift()));
          add("messageerror", (event) => contexts.set(event, queue.shift()));
          const listeners = new WeakMap<object, EventListener>();
          const wrap = (listener: EventListenerOrEventListenerObject) => {
            let wrapped = listeners.get(listener);
            if (!wrapped) {
              wrapped = (event) =>
                withContext(
                  contexts.get(event),
                  () => {
                    if (typeof listener === "function")
                      listener.call(port, event);
                    else listener.handleEvent(event);
                  },
                  [],
                );
              listeners.set(listener, wrapped);
            }
            return wrapped;
          };
          const remove = port.removeEventListener.bind(port);
          port.addEventListener = ((
            type: string,
            listener: EventListenerOrEventListenerObject | null,
            options?: boolean | AddEventListenerOptions,
          ) =>
            listener &&
            add(
              type,
              ["message", "messageerror"].includes(type)
                ? wrap(listener)
                : listener,
              options,
            )) as typeof port.addEventListener;
          port.removeEventListener = ((
            type: string,
            listener: EventListenerOrEventListenerObject | null,
            options?: boolean | AddEventListenerOptions,
          ) =>
            listener &&
            remove(
              type,
              ["message", "messageerror"].includes(type)
                ? (listeners.get(listener) ?? listener)
                : listener,
              options,
            )) as typeof port.removeEventListener;
          for (const name of ["onmessage", "onmessageerror"] as const) {
            let stored: ((event: MessageEvent) => void) | null = null;
            const type = name.slice(2);
            Object.defineProperty(port, name, {
              configurable: true,
              enumerable: true,
              get: () => stored,
              set: (value) => {
                if (stored) remove(type, wrap(stored as EventListener));
                stored = typeof value === "function" ? value : null;
                if (stored) {
                  add(type, wrap(stored as EventListener));
                  if (name === "onmessage") port.start();
                }
              },
            });
          }
          const close = port.close.bind(port);
          port.close = () => {
            queue.length = 0;
            close();
          };
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

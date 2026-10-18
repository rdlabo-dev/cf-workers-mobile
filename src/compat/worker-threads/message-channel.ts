// Adapted from workerd messagechannel.c++ at 5358e3d337336eaf696a48bc1563d808b10feba5.
// Copyright Cloudflare, Inc. Licensed under Apache-2.0 (LICENSE-APACHE).
// Workers ports deliver within the same isolate, on microtasks. Browser ports
// deliver on a task queue and support transfers; forwarding them changes both
// observable ordering and ownership. Keep this adapter local to the module.
const token = Symbol("MessagePort construction");
let makePair: () => [MessagePort, MessagePort];
const deliveryErrors = new WeakMap<
  Event,
  { error?: unknown; threw: boolean }
>();
import { structuredClone as clone } from "../../browser/structured-clone/index.js";
type Listener = EventListenerOrEventListenerObject;
type Registration = {
  listener: Listener;
  capture: boolean;
  wrapped: EventListener;
  release?: () => void;
};

export class MessagePort extends EventTarget {
  #other?: MessagePort;
  #state: "pending" | "started" | "closed" = "pending";
  #pending: unknown[] = [];
  #listeners: Registration[] = [];
  #onmessage: ((event: MessageEvent) => void) | null = null;
  #onmessageListener: EventListener = (event) =>
    this.#onmessage?.call(this, event as MessageEvent);

  constructor(key?: symbol) {
    super();
    if (key !== token) throw new TypeError("Illegal constructor");
  }

  static {
    makePair = () => {
      const a = new MessagePort(token),
        b = new MessagePort(token);
      a.#other = b;
      b.#other = a;
      return [a, b];
    };
  }

  override addEventListener(
    type: string,
    listener: Listener | null,
    options?: boolean | AddEventListenerOptions,
  ) {
    if (type !== "message" || !listener)
      return super.addEventListener(type, listener, options);
    const capture = typeof options === "boolean" ? options : !!options?.capture;
    const settings =
      typeof options === "object" && options !== null ? options : {};
    if (
      settings.signal?.aborted ||
      this.#listeners.some(
        (r) => r.listener === listener && r.capture === capture,
      )
    )
      return;
    const wrapped: EventListener = (event) => {
      if (settings.once) this.removeEventListener(type, listener, capture);
      try {
        if (typeof listener === "function") listener.call(this, event);
        else listener.handleEvent(event);
      } catch (error) {
        const delivery = deliveryErrors.get(event);
        if (!delivery) throw error;
        if (!delivery.threw) {
          delivery.error = error;
          delivery.threw = true;
        }
        // Like workerd, report uncaught listener errors and continue dispatch.
        globalThis.reportError?.(error);
      }
    };
    const registration: Registration = { listener, capture, wrapped };
    this.#listeners.push(registration);
    super.addEventListener(type, wrapped, options);
    if (settings.signal) {
      const signal = settings.signal;
      const abort = () => this.removeEventListener(type, listener, capture);
      signal.addEventListener("abort", abort, { once: true });
      registration.release = () => signal.removeEventListener("abort", abort);
    }
    this.start();
  }

  override removeEventListener(
    type: string,
    listener: Listener | null,
    options?: boolean | EventListenerOptions,
  ) {
    if (type !== "message")
      return super.removeEventListener(type, listener, options);
    const capture = typeof options === "boolean" ? options : !!options?.capture;
    const index = this.#listeners.findIndex(
      (r) => r.listener === listener && r.capture === capture,
    );
    if (index < 0) return;
    this.#listeners[index]!.release?.();
    super.removeEventListener(type, this.#listeners[index]!.wrapped, capture);
    this.#listeners.splice(index, 1);
    if (!this.#listeners.length && this.#state === "started")
      this.#state = "pending";
  }

  get onmessage() {
    return this.#onmessage;
  }
  set onmessage(value: ((event: MessageEvent) => void) | null) {
    const hadHandler = this.#onmessage !== null;
    this.#onmessage = typeof value === "function" ? value : null;
    if (hadHandler && !this.#onmessage)
      this.removeEventListener("message", this.#onmessageListener);
    else if (!hadHandler && this.#onmessage)
      this.addEventListener("message", this.#onmessageListener);
  }

  postMessage(
    value?: unknown,
    options?: Transferable[] | StructuredSerializeOptions | null,
  ) {
    if (options != null && typeof options !== "object")
      throw new TypeError(
        "Failed to execute 'postMessage' on 'MessagePort': parameter 2 is not of type 'Array or PostMessageOptions'.",
      );
    const transfer = Array.isArray(options) ? options : options?.transfer;
    if (transfer != null && Array.from(transfer).length)
      throw new Error("Transfer list is not supported");
    // Serialization is required even after either endpoint has closed.
    const copy = clone(value);
    const peer = this.#other;
    if (!peer || peer.#state === "closed") return;
    if (peer.#state === "pending") peer.#pending.push(copy);
    else queueMicrotask(() => peer.#deliver(copy));
  }

  #deliver(value: unknown) {
    const event = new MessageEvent("message", { data: value });
    Object.defineProperty(event, "source", { value: this });
    const delivery = { error: undefined as unknown, threw: false };
    deliveryErrors.set(event, delivery);
    try {
      this.dispatchEvent(event);
    } finally {
      deliveryErrors.delete(event);
    }
    if (delivery.threw) {
      const failure = new MessageEvent("messageerror", {
        data: delivery.error,
      });
      Object.defineProperty(failure, "source", { value: this });
      this.dispatchEvent(failure);
    }
  }

  start() {
    if (this.#state !== "pending") return;
    this.#state = "started";
    const pending = this.#pending;
    this.#pending = [];
    queueMicrotask(() => {
      for (const value of pending) this.#deliver(value);
    });
  }

  close() {
    if (this.#state === "closed") return;
    this.#state = "closed";
    this.#pending = [];
    const peer = this.#other;
    this.#other = undefined;
    peer?.close();
    this.dispatchEvent(new Event("close"));
  }
}

export class MessageChannel {
  readonly port2: MessagePort;
  readonly port1: MessagePort;
  constructor() {
    [this.port1, this.port2] = makePair();
  }
}

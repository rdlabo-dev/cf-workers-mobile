import { AsyncLocalStorage } from "../async-hooks/index.js";
export type MessageCallback = (message: unknown, name: string | symbol) => void;
type Store = {
  ref: WeakRef<AsyncLocalStorage<unknown>>;
  transform: (message: unknown) => unknown;
};
const getStore = AsyncLocalStorage.prototype.getStore;
const runStore = AsyncLocalStorage.prototype.run;
type State = {
  name: string | symbol;
  subscribers: MessageCallback[];
  stores: Store[];
};
const states = new WeakMap<Channel, State>();
const channels = new Map<string, Channel>();
const illegal =
  "Illegal invocation: function called with incorrect `this` reference. See https://developers.cloudflare.com/workers/observability/errors/#illegal-invocation-errors for details.";
function state(channel: Channel): State {
  const value = states.get(channel);
  if (!value) throw new TypeError(illegal);
  return value;
}
function callback(
  value: unknown,
  method: string,
  parameter: number,
  owner = "Channel",
): asserts value is MessageCallback {
  if (typeof value !== "function")
    throw new TypeError(
      `Failed to execute '${method}' on '${owner}': parameter ${parameter} is not of type 'function'.`,
    );
}
function storage(
  value: unknown,
  method: string,
): asserts value is AsyncLocalStorage<unknown> {
  if (value instanceof AsyncLocalStorage) {
    try {
      getStore.call(value);
      return;
    } catch {}
  }
  throw new TypeError(
    `Failed to execute '${method}' on 'Channel': parameter 1 is not of type 'AsyncLocalStorage'.`,
  );
}
// KJ's table erases by moving its last row into the removed row's slot.
function erase<T>(values: T[], index: number) {
  if (index < 0) return;
  const last = values.pop()!;
  if (index < values.length) values[index] = last;
}
function publish(current: State, message: unknown): void {
  const { name, subscribers } = current;
  for (const fn of subscribers.slice())
    Reflect.apply(fn, globalThis, [message, name]);
}
class ChannelImplementation {
  constructor() {
    throw new TypeError("Illegal constructor");
  }
  get hasSubscribers() {
    return state(this).subscribers.length !== 0;
  }
  publish(message?: unknown): void {
    publish(state(this), message);
  }
  subscribe(fn: MessageCallback): void {
    const { subscribers } = state(this);
    callback(fn, "subscribe", 1);
    if (!subscribers.includes(fn)) subscribers.push(fn);
  }
  unsubscribe(fn: MessageCallback): void {
    const { subscribers } = state(this);
    callback(fn, "unsubscribe", 1);
    erase(subscribers, subscribers.indexOf(fn));
  }
  bindStore(
    store: AsyncLocalStorage<unknown>,
    transform?: (message: unknown) => unknown,
  ): void {
    const { stores } = state(this);
    storage(store, "bindStore");
    if (transform !== undefined) callback(transform, "bindStore", 2);
    const entry = stores.find((entry) => entry.ref.deref() === store);
    const fn = transform ?? ((message: unknown) => message);
    if (entry) entry.transform = fn;
    else stores.push({ ref: new WeakRef(store), transform: fn });
  }
  unbindStore(store: AsyncLocalStorage<unknown>): void {
    const { stores } = state(this);
    storage(store, "unbindStore");
    erase(
      stores,
      stores.findIndex((entry) => entry.ref.deref() === store),
    );
  }
  runStores<T>(
    message: unknown,
    fn: (...args: any[]) => T,
    receiver: unknown = globalThis,
    ...args: unknown[]
  ): T {
    const current = state(this);
    callback(fn, "runStores", 2);
    const stores = current.stores.map(({ ref, transform }) => ({
      store: ref.deref(),
      transform,
    }));
    const run = (index: number): T => {
      if (index === stores.length) {
        publish(current, message);
        return Reflect.apply(fn, receiver, args);
      }
      const { store, transform } = stores[index]!;
      const value = Reflect.apply(transform, globalThis, [message]);
      return store
        ? (runStore.call(store, value, () => run(index + 1)) as T)
        : run(index + 1);
    };
    return run(0);
  }
}
Object.defineProperty(ChannelImplementation, "name", {
  value: "Channel",
  configurable: true,
});
export type Channel = ChannelImplementation;
export const Channel = new Proxy(ChannelImplementation, {
  apply() {
    throw new TypeError("Illegal constructor");
  },
});
Object.defineProperty(Channel.prototype, "constructor", { value: Channel });
for (const key of Object.getOwnPropertyNames(Channel.prototype)) {
  if (key !== "constructor") {
    Object.defineProperty(Channel.prototype, key, { enumerable: true });
    const value = Object.getOwnPropertyDescriptor(
      Channel.prototype,
      key,
    )?.value;
    if (typeof value === "function")
      Object.defineProperty(value, "length", { value: 0 });
  }
}
Object.defineProperty(Channel.prototype, Symbol.toStringTag, {
  value: "Channel",
  configurable: true,
});
const subscribeChannel = Channel.prototype.subscribe;
const unsubscribeChannel = Channel.prototype.unsubscribe;
function key(value: unknown): string | symbol {
  // The computed property operation performs the WebIDL Name/ToPropertyKey conversion.
  return Reflect.ownKeys({ [value as PropertyKey]: 0 })[0]!;
}
export function channel(name: string | symbol): Channel {
  const property = key(name),
    id = String(property);
  let value = channels.get(id);
  if (!value) {
    value = Object.create(Channel.prototype) as Channel;
    states.set(value, { name: property, subscribers: [], stores: [] });
    channels.set(id, value);
  }
  return value;
}
export function hasSubscribers(name: string | symbol): boolean {
  const value = channels.get(String(key(name)));
  return value !== undefined && state(value).subscribers.length !== 0;
}
export function subscribe(name: string | symbol, fn: MessageCallback): void {
  // Module-level methods convert the name before validating the callback.
  const property = key(name);
  callback(fn, "subscribe", 2, "DiagnosticsChannelModule");
  subscribeChannel.call(channel(property), fn);
}
export function unsubscribe(name: string | symbol, fn: MessageCallback): void {
  const property = key(name);
  callback(fn, "unsubscribe", 2, "DiagnosticsChannelModule");
  const value = channels.get(String(property));
  if (value) unsubscribeChannel.call(value, fn);
}
export default { Channel, channel, hasSubscribers, subscribe, unsubscribe };

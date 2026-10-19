import { bindCallback } from "../async-hooks/callbacks.js";
// Browser timers wrap large delays at 2^31; Workers clamps at 100 years.
const nativeKey = Symbol.for("workers-capacitor/native-timers");
type Native = {
  setTimeout: typeof globalThis.setTimeout;
  setInterval: typeof globalThis.setInterval;
  clearTimeout: typeof globalThis.clearTimeout;
  clearInterval: typeof globalThis.clearInterval;
};
export const native: Native = (
  globalThis.setTimeout as unknown as Record<symbol, Native>
)[nativeKey] ?? {
  setTimeout: globalThis.setTimeout.bind(globalThis),
  setInterval: globalThis.setInterval.bind(globalThis),
  clearTimeout: globalThis.clearTimeout.bind(globalThis),
  clearInterval: globalThis.clearInterval.bind(globalThis),
};
export function rememberHost(fn: Function) {
  Object.defineProperty(fn, nativeKey, { value: native });
}
const maxChunk = 2147483647;
const long = new Map<
  number,
  { handle: ReturnType<typeof native.setTimeout> }
>();
export function schedule(
  callback: (...args: unknown[]) => unknown,
  milliseconds: number,
  args: unknown[],
  repeat: boolean,
): number {
  if (typeof callback !== "function")
    throw new TypeError("Callback must be a function");
  callback = bindCallback(callback);
  args = [...args];
  const delay =
    Number.isNaN(milliseconds) || milliseconds <= 0
      ? 0
      : Math.min(Math.trunc(milliseconds), 3153600000000);
  if (delay <= maxChunk)
    return (repeat ? native.setInterval : native.setTimeout)(
      () => Reflect.apply(callback, globalThis, args),
      delay,
    ) as unknown as number;
  let remaining = delay;
  let id: number;
  const state = {
    handle: undefined as unknown as ReturnType<typeof native.setTimeout>,
  };
  const arm = () => {
    const chunk = Math.min(remaining, maxChunk);
    remaining -= chunk;
    state.handle = native.setTimeout(() => {
      if (remaining > 0) {
        arm();
        return;
      }
      if (repeat) {
        remaining = delay;
        arm();
      } else long.delete(id);
      Reflect.apply(callback, globalThis, args);
    }, chunk);
  };
  arm();
  id = state.handle as unknown as number;
  long.set(id, state);
  return id;
}
export function clear(id: number, repeat: boolean) {
  const state = long.get(id);
  if (state) {
    native.clearTimeout(state.handle);
    long.delete(id);
  } else (repeat ? native.clearInterval : native.clearTimeout)(id as never);
}

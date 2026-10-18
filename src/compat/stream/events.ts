// @ts-nocheck
export { EventEmitter } from "node:events";
import { dispose } from "../../shared/globals/symbols.js";
import { ERR_INVALID_ARG_TYPE } from "../net/errors.js";
import { validateAbortSignal, validateFunction } from "../net/validators.js";
export function addAbortListener(
  signal: AbortSignal | undefined,
  listener: any,
) {
  if (signal === undefined) {
    throw new ERR_INVALID_ARG_TYPE("signal", "AbortSignal", signal);
  }
  validateAbortSignal(signal, "signal");
  validateFunction(listener, "listener");

  let removeEventListener: Function;
  if (signal.aborted) {
    queueMicrotask(() => listener());
  } else {
    signal.addEventListener("abort", listener, { once: true });
    removeEventListener = () => {
      signal.removeEventListener("abort", listener);
    };
  }
  return {
    __proto__: null,
    [dispose]() {
      removeEventListener?.();
    },
  };
}

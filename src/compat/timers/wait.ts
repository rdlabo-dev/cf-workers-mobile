import { platform } from "../../shared/globals/platform.js";
import { schedule, clear } from "./host.js";
const aborted = Object.getOwnPropertyDescriptor(
  AbortSignal.prototype,
  "aborted",
)!.get!;
const signalReason = Object.getOwnPropertyDescriptor(
  AbortSignal.prototype,
  "reason",
)!.get!;
const follow = AbortSignal.any.bind(AbortSignal);
const addListener = EventTarget.prototype.addEventListener;
const removeListener = EventTarget.prototype.removeEventListener;
const domName = Object.getOwnPropertyDescriptor(
  DOMException.prototype,
  "name",
)!.get!;
const domMessage = Object.getOwnPropertyDescriptor(
  DOMException.prototype,
  "message",
)!.get!;
function reason(value: unknown): unknown {
  try {
    return convertReason(value);
  } catch {
    return new Error("#<Object>");
  }
}
function convertReason(value: unknown): unknown {
  // Intrinsic getters read the native exception, ignoring shadowed properties.
  try {
    return new DOMException(domMessage.call(value), domName.call(value));
  } catch {
    /* Not a DOMException. */
  }
  if (typeof value === "object" && value !== null) {
    try {
      return platform.structuredClone(value);
    } catch {
      // workerd's exception transport falls back when serialization fails.
      // Never allow a conversion exception to strand an aborted wait.
      try {
        if (Object.getPrototypeOf(value) === null)
          return new Error("[object Object]");
        const constructor = Object.getOwnPropertyDescriptor(
          Object.getPrototypeOf(value),
          "constructor",
        )?.value;
        return new Error(
          `#<${typeof constructor === "function" ? constructor.name : "Object"}>`,
        );
      } catch {
        return new Error("#<Object>");
      }
    }
  }
  try {
    return new Error(String(value));
  } catch {
    return new Error("#<Object>");
  }
}
/** Workers scheduler.wait uses Web IDL conversion, not timers/promises validation. */
export function wait(
  delay: number,
  options?: { signal?: AbortSignal },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const value = +delay;
    if (
      options != null &&
      typeof options !== "object" &&
      typeof options !== "function"
    )
      throw new TypeError(
        "Failed to execute 'wait' on 'Scheduler': parameter 2 is not of type 'WaitOptions'.",
      );
    const input = options?.signal;
    let signal: AbortSignal | undefined;
    if (input != null) {
      try {
        aborted.call(input);
      } catch {
        throw new TypeError(
          "Incorrect type for the 'signal' field on 'WaitOptions': the provided value is not of type 'AbortSignal'.",
        );
      }
    }
    // A private dependent signal follows the internal abort state even when a
    // caller shadows properties or stops propagation on the original signal.
    if (input != null) signal = follow([input]);
    if (signal && aborted.call(signal)) {
      reject(reason(signalReason.call(signal)));
      return;
    }
    const timer = schedule(
      () => {
        if (signal) removeListener.call(signal, "abort", onAbort);
        resolve();
      },
      value,
      [],
      false,
    );
    function onAbort() {
      clear(timer, false);
      if (signal) removeListener.call(signal, "abort", onAbort);
      reject(reason(signalReason.call(signal)));
    }
    if (signal) addListener.call(signal, "abort", onAbort, { once: true });
  });
}

import { nativeStreams, nativeStreamsSymbol } from "../../shared/globals/platform.js";
import { bindCallback } from "../async-hooks/callbacks.js";
/** Capture stream callbacks without replacing the globals when ALS starts. */
export function contextConstructor<T extends new (...args: any[]) => any>(
  Constructor: T,
  methods: readonly string[],
): T {
  let wrapped: T;
  wrapped = new Proxy(Constructor, {
    get(target, key, receiver) {
      return key === nativeStreamsSymbol
        ? nativeStreams
        : Reflect.get(target, key, receiver);
    },
    construct(target, args, newTarget) {
      const source = args[0];
      if (
        source !== null &&
        (typeof source === "object" || typeof source === "function")
      ) {
        const dictionary = new Proxy(source, {
          get(original, key) {
            const value = Reflect.get(original, key, original);
            if (
              typeof key !== "string" ||
              !methods.includes(key) ||
              typeof value !== "function"
            )
              return value;
            const callback = bindCallback(value);
            return function (this: unknown, ...values: unknown[]) {
              return Reflect.apply(
                callback,
                this === dictionary ? original : this,
                values,
              );
            };
          },
        });
        args = [dictionary, ...args.slice(1)];
      }
      return Reflect.construct(
        target,
        args,
        newTarget === wrapped ? target : newTarget,
      );
    },
  });
  return wrapped;
}

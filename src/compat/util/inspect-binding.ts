import { ALL_PROPERTIES, ONLY_ENUMERABLE } from "./properties.js";
// V8's synchronous inspection hooks are not Web APIs. Never invent a pending
// Promise state or consume an iterator just to display it.
function unavailable(operation: string): never {
  throw new Error(
    `${operation} requires JavaScript engine inspection hooks unavailable in a WebView`,
  );
}
export default {
  ALL_PROPERTIES,
  ONLY_ENUMERABLE,
  getOwnNonIndexProperties(value: object, filter: number) {
    return Reflect.ownKeys(value).filter((key) => {
      if (
        typeof key === "string" &&
        /^(0|[1-9]\d*)$/.test(key) &&
        Number(key) < 4294967295
      )
        return false;
      return (
        !(filter & ONLY_ENUMERABLE) ||
        Object.getOwnPropertyDescriptor(value, key)?.enumerable
      );
    });
  },
  kResourceTypeInspect: Symbol("kResourceTypeInspect"),
  kPending: 0,
  kRejected: 2,
  getConstructorName(value: object) {
    const proto = Object.getPrototypeOf(value);
    const ctor =
      proto && Object.getOwnPropertyDescriptor(proto, "constructor")?.value;
    return typeof ctor === "function" ? ctor.name : "Object";
  },
  // Ordinary properties remain inspectable; this cannot unwrap or identify a
  // pre-existing Proxy without invoking traps. That engine gap is not supported.
  getProxyDetails(_value: unknown): undefined {
    return undefined;
  },
  getPromiseDetails(_value: unknown): never {
    return unavailable("Inspecting Promise state");
  },
  previewEntries(_value: unknown): never {
    return unavailable("Inspecting hidden collection or iterator entries");
  },
};

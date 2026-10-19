// Shared URL recognition without importing the parser into Web-only entrypoints.
export const hostKey = Symbol.for("@rdlabo/workers-capacitor/native-url");
export const NativeURL: typeof globalThis.URL =
  (globalThis.URL as unknown as Record<symbol, typeof globalThis.URL>)[
    hostKey
  ] ?? globalThis.URL;
export const instanceKey = Symbol.for("@rdlabo/workers-capacitor/url-instance");
export function isURLInstance(value: unknown): value is globalThis.URL {
  return (
    value instanceof NativeURL ||
    (typeof value === "object" &&
      value !== null &&
      (value as Record<symbol, unknown>)[instanceKey] === true)
  );
}

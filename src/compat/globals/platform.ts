export const nativeBlobConstructor = Symbol.for(
  "@rdlabo/capacitor-workers/native-blob",
);
export const nativeFileConstructor = Symbol.for(
  "@rdlabo/capacitor-workers/native-file",
);

function original<T>(value: T, key: symbol): T {
  return (value as Record<symbol, T>)[key] ?? value;
}

// One capture point, evaluated before either direct or Worker installation.
// Codecs and browser fallbacks must never read replacement globals lazily.
export const platform = {
  Blob: original(globalThis.Blob, nativeBlobConstructor),
  File: original(globalThis.File, nativeFileConstructor),
  Request: globalThis.Request,
  Response: globalThis.Response,
  Headers: globalThis.Headers,
  fetch: globalThis.fetch.bind(globalThis),
  structuredClone: globalThis.structuredClone.bind(globalThis),
};

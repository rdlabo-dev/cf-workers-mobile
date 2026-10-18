// One capture point, evaluated before either direct or Worker installation.
// Codecs and browser fallbacks must never read replacement globals lazily.
export const platform = {
  Request: globalThis.Request,
  Response: globalThis.Response,
  Headers: globalThis.Headers,
  fetch: globalThis.fetch.bind(globalThis),
  structuredClone: globalThis.structuredClone.bind(globalThis),
};

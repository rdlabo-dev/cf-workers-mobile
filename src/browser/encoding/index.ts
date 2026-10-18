// These APIs use the host engine; their shared contract runs in workerd and
// both WebViews before this implementation can be certified.
export const { TextEncoder, TextDecoder } = globalThis;

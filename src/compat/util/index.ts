// Re-exports the browser util polyfill plus the globals the Workers/Node
// surface provides (server renderers read util.TextEncoder/TextDecoder).
// @ts-expect-error the polyfill ships CJS without declarations
export * from "util/util.js";
// @ts-expect-error the polyfill ships CJS without declarations
import util from "util/util.js";
export const TextEncoder = globalThis.TextEncoder;
export const TextDecoder = globalThis.TextDecoder;
export default { ...util, TextEncoder, TextDecoder };

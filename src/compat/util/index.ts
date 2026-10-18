import * as core from "./core.js";
export * from "./core.js";
// Vite dev cannot discover named exports through `export *` from CommonJS.
// @ts-expect-error the polyfill ships CJS without declarations
import util from "util/util.js";
export const {
  debuglog,
  format,
  inspect,
  isArray,
  isBoolean,
  isBuffer,
  isDate,
  isError,
  isFunction,
  isNull,
  isNullOrUndefined,
  isNumber,
  isObject,
  isPrimitive,
  isRegExp,
  isString,
  isSymbol,
  isUndefined,
  log,
  types,
} = util;
export const TextEncoder = globalThis.TextEncoder;
export const TextDecoder = globalThis.TextDecoder;
export default { ...util, ...core, TextEncoder, TextDecoder };

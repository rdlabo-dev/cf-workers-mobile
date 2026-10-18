// Vite dev cannot discover named exports through `export *` from CommonJS.
// @ts-expect-error the polyfill ships CJS without declarations
import util from "util/util.js";
export const {
  _extend,
  callbackify,
  debuglog,
  deprecate,
  format,
  inherits,
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
  promisify,
  types,
} = util;
export const TextEncoder = globalThis.TextEncoder;
export const TextDecoder = globalThis.TextDecoder;
export default { ...util, TextEncoder, TextDecoder };
